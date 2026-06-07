# グループ参加・退会・権限のFirestoreルール見直し 設計

- 日付: 2026-06-07
- 対象: `firestore.rules` / `src/lib/db.ts` / `src/views/GroupSetupView.tsx` / `src/views/HomeView.tsx` / `src/lib/db.test.ts`

## 背景・問題

新メンバーを招待コードで参加させたいが、現行の `firestore.rules` では参加が拒否される。

`groups` の更新ルールが以下のため:

```js
allow update: if isAllowed() && isMember(groupId);
```

`isMember(groupId)` は「**現在保存されている** `memberUids` に自分の uid が含まれるか」を判定する（`firestore.rules` の `get(...).data.memberUids`）。

`joinGroupByCode`（`src/lib/db.ts:51`）は新メンバー自身の認証で `updateDoc` を実行し、自分の uid を `memberUids` に追加しようとする。しかしルール評価時点で自分はまだメンバーではないため `isMember` が `false` となり、`permission-denied` で拒否される。結果、招待コードで参加できない。`parties` サブコレクションも `isMember` 必須のため、参加できない新メンバーは飲み会記録を読めない。

### 既存テストの盲点

`src/lib/db.test.ts:148`「joinGroupByCode で別ユーザーが既存グループに参加できる」は通っているが、本番フローを再現していない。`beforeAll` で `auth` にサインインするのは作成者 `USER_A` のみで、`USER_B` としてサインインし直していない。`joinGroupByCode('JOIN01', USER_B.uid, USER_B.email)` は引数で `USER_B` を渡すが、実際の認証主体は `USER_A`（作成者＝メンバー）のままなので `isMember` を通過してしまう。本番では新メンバー自身の認証で走るため拒否される。

## 決定事項

| 論点 | 決定 |
|------|------|
| スコープ | 参加＋退会＋権限を全体見直し（`groups` 更新ルールを操作種別ごとに最小権限へ分離） |
| 厳格度 | 操作種別ごとにフィールド限定（変更可能フィールドをルールで制限。email 詐称・フィールド改ざんを防止） |
| 検証方法 | Firebase emulator + `@firebase/rules-unit-testing` で自動テスト（既存基盤を利用） |

## ルール設計（`firestore.rules`）

`groups` の `update` を **join / leave / 設定変更** の3分岐に分け、`create` も最小権限に絞る。`read` と `parties` は維持。

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAuthenticated() {
      return request.auth != null;
    }

    function isAllowed() {
      return isAuthenticated() &&
        request.auth.token.email in
          get(/databases/$(database)/documents/config/allowedUsers).data.emails;
    }

    function isMember(groupId) {
      return isAuthenticated() &&
        request.auth.uid in
          get(/databases/$(database)/documents/groups/$(groupId)).data.memberUids;
    }

    // 変更されたトップレベルキーの集合
    function changedKeys() {
      return request.resource.data.diff(resource.data).affectedKeys();
    }

    // ① 参加: 自分の uid/email だけを追加（他人の uid・email 詐称は不可）
    function joinsSelf() {
      return changedKeys().hasOnly(['memberUids', 'memberEmails'])
        && !(request.auth.uid in resource.data.memberUids)
        && request.resource.data.memberUids.toSet()
             == resource.data.memberUids.toSet().union([request.auth.uid].toSet())
        && request.resource.data.memberEmails.toSet()
             == resource.data.memberEmails.toSet().union([request.auth.token.email].toSet());
    }

    // ② 退会: 自分の uid/email だけを削除
    function leavesSelf() {
      return changedKeys().hasOnly(['memberUids', 'memberEmails'])
        && (request.auth.uid in resource.data.memberUids)
        && request.resource.data.memberUids.toSet()
             == resource.data.memberUids.toSet().difference([request.auth.uid].toSet())
        && request.resource.data.memberEmails.toSet()
             == resource.data.memberEmails.toSet().difference([request.auth.token.email].toSet());
    }

    // ③ 設定変更: 既存メンバーが招待コード / Claude APIキー のみ変更
    function editsSettings(groupId) {
      return isMember(groupId)
        && changedKeys().hasOnly(['inviteCode', 'claudeApiKey']);
    }

    // 許可ユーザーリストは認証済みなら誰でも読める（ログイン確認のため）
    match /config/allowedUsers {
      allow read: if isAuthenticated();
      allow write: if false;
    }

    match /groups/{groupId} {
      allow read:   if isAllowed();   // 招待コード検索（list クエリ）に必要なため維持
      allow create: if isAllowed()
                       && request.resource.data.memberUids == [request.auth.uid]
                       && request.resource.data.memberEmails == [request.auth.token.email];
      allow update: if isAllowed() && (joinsSelf() || leavesSelf() || editsSettings(groupId));
      allow delete: if false;

      match /parties/{partyId} {
        allow read, write: if isAllowed() && isMember(groupId);
      }
    }
  }
}
```

### 設計判断とトレードオフ

- `joinsSelf`/`leavesSelf` は `toSet()` 比較で順序非依存にする。`arrayRemove` の結果ともマッチし、配列順序や重複の差異に影響されない。
- `token.email` を強制することで、参加時に他人の email を `memberEmails` に混入させる詐称を防ぐ。
- `create` を「作成者本人だけが初期メンバー」に厳格化。現 `createGroup`（`src/lib/db.ts:38`）は `memberUids: [creatorUid]` / `memberEmails: [creatorEmail]` で作成し、`creatorEmail` は `auth.currentUser.email` なので適合する。
- `update` のどの分岐にも該当しないため、`name` / `members` / `createdBy` / `createdAt` は更新で誰も変更できなくなる。現状そのような編集機能は存在しないため問題なし。将来メンバー名編集が必要になれば分岐を追加する。
- `read` は `isAllowed()` を維持。招待コード検索は list クエリで、ドキュメント read 権限が必要なため。`isMember` に絞ると参加前に検索できなくなる。5人の友人グループのためプライバシー上は許容する。

## クライアント修正

ルールが `token.email` を強制するため、`email` が空（`null`）だと参加・退会が拒否される。Google ログインでは必ず取得できるが型上は `string | null` のため、空なら操作を中断する（握りつぶさず明示エラー）。

| ファイル | 変更 |
|---------|------|
| `src/lib/db.ts` | `leaveGroup` の `if (email)` 分岐を削除し、`memberEmails` を常に `arrayRemove`（email 必須前提） |
| `src/views/GroupSetupView.tsx:34` | `joinGroupByCode` 呼び出し前に `if (!user.email) { alert('メールアドレスが取得できませんでした'); return; }` |
| `src/views/HomeView.tsx:47` | `leaveGroup` も同様に `user.email` 非 null を保証してから渡す |

`joinGroupByCode` / `leaveGroup` 自体のロジック（自分を追加/削除）は変更不要。本人の uid/email を渡しているのでルールに適合する。

## テスト設計（`src/lib/db.test.ts`）

2層でカバーする。

### (A) 正常系 — db.ts 関数を本番フローで検証（認証主体を切り替える）

- 既存の join テストを修正: **`USER_B` として `auth` にサインインし直してから** `joinGroupByCode` を実行し、修正後ルールで通ることを確認する（今回の主目的）。
- サインインユーザーを切り替えるヘルパーを追加。`USER_B` も Auth Emulator に作成する。テスト後は `USER_A` に戻し、他テストへ影響させない。

### (B) ルール境界テスト — `testEnv.authenticatedContext()` で raw 操作

db.ts は正常系しか叩かないため、なりすまし・改ざん系はルール単体テストとして生コンテキストで直接検証する。表のとおり成功すべき境界ケースも併せて確認する（`assertSucceeds` / `assertFails`）。

| ケース | 期待 |
|--------|------|
| 非メンバーが他人の uid を追加 | 拒否 |
| 参加時に他人の email を `memberEmails` に入れる | 拒否 |
| メンバーが他人を削除 | 拒否 |
| メンバーが `name` / `members` を改ざん | 拒否 |
| 新メンバー本人が自分の uid/email を追加（join） | 成功 |
| メンバーが自分を削除（leave） | 成功 |
| メンバーが `inviteCode` / `claudeApiKey` を変更 | 成功 |
| allowedリスト外ユーザーの全操作 | 拒否 |

`@firebase/rules-unit-testing` の `assertSucceeds` / `assertFails` を使用する。

## デプロイ手順

ルールは本番反映が必要（Firebase Console のデータ編集とは別）。本番影響操作のため、実装担当（Claude）は実行せず、ユーザーが実行する。

```bash
npm run test:emulators   # ① ルールテストが緑であることを確認
npm run build            # ② ビルド確認（CLAUDE.md のワークフロー）
firebase deploy --only firestore:rules   # ③ ユーザーが実行（または Console のルールエディタに貼付）
```

## リスク・注意

- **既存グループの `memberEmails`**: `joinsSelf` / `leavesSelf` は `resource.data.memberEmails` を参照する。ごく初期に作られたグループで `memberEmails` フィールドが存在しない場合、参加・退会がエラーになる可能性がある。現行 `createGroup` は `memberEmails` をセットしているため通常は問題ないが、本番反映前に既存グループに `memberEmails` があるか確認し、無ければ Console で補完する。
- **Firestore ルール機能**: `diff().affectedKeys()` と `toSet()` 比較は rules version 2 の機能で、emulator・本番とも対応済み。
- **`create` の配列比較**: `request.resource.data.memberUids == [request.auth.uid]` は順序込みの完全一致。`createGroup` は単一要素 `[creatorUid]` を渡すため順序問題は生じない。

## 将来の拡張

- メンバー名編集機能を追加する場合、`members` の変更を許可する分岐（編集者がメンバーであること等の条件付き）を `update` に追加する。
- 1ユーザーが複数グループに所属する場合、`findUserGroup`（`src/lib/db.ts:84`）の「先頭1件」前提を見直す。

## 変更ファイル一覧

- `firestore.rules` — ルール本体
- `src/lib/db.ts` — `leaveGroup` の email 必須化
- `src/views/GroupSetupView.tsx` — join 前の email 非 null チェック
- `src/views/HomeView.tsx` — leave 前の email 非 null チェック
- `src/lib/db.test.ts` — join テストの本番フロー化 + 拒否系テスト追加
