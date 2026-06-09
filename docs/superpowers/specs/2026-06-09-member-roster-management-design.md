# メンバー名簿管理 設計

作成日: 2026-06-09

## 背景・目的

「メンバーが他グループでも使いたい」という要望に応え、グループのメンバー名簿を**追加・削除（隠す）・復活・改名**できるようにする。

### 現状の重要な前提（コード調査で判明）

メンバーは**ハードコードされていない**。すでにグループ単位の名簿が Firestore に保存される構造が入っている。

- `Group.members`（`{id, name}[]`）が各グループのメンバー名簿。`rosterOf(group)` がこれを正として読み、`FIXED_MEMBERS` は未設定時のフォールバック/初期シードにすぎない（`src/lib/party.ts:9`）
- アプリはすでにマルチグループ対応（招待コードで作成・参加、グループごとに parties・集計が分離）
- ログイン制限は `config/allowedUsers.emails` の許可リストで別管理（`firestore.rules`）。**名簿を編集してもログインできる人は変わらない** → 「ログインは現状の許可メンバーのみ」という要件は自動的に満たされる

### 足りないもの（今回の対象）

1. 名簿を編集する UI が無い
2. `createGroup` が常に `FIXED_MEMBERS` をシードする（`GroupSetupView.tsx:21`）→ 別グループを新規作成しても既存5人が初期名簿に入る
3. Firestore ルールが `members` の更新を許可していない（`inviteCode`/`claudeApiKey` のみ）

## 確定した方針

| 論点 | 決定 |
|------|------|
| 利用形態 | 新規グループ（自分たちの名簿）と既存グループの名簿編集の**両方**に対応 |
| 削除の振る舞い | **ソフト削除**（隠すだけ）。集計からは消えるが復活可能 |
| 再追加 | 「以前いたメンバー」から戻すと**同一人物として過去の集計も復活**。新しい名前は別人（新 id） |
| 管理方式 | **ニックネームのみ**（`{id, name}`）。メアド紐付けはしない。id 安定なので改名は名前のみ書き換え |
| 進行中パーティ | 名簿追加は**進行中の飲み会にもその場で反映**（カスケード） |
| アーキテクチャ | 方針A: 名簿を唯一の真実とし、進行中パーティへカスケード |

### 採用しなかった案

- **方針B（パーティごとに参加者を都度選ぶ二層モデル）**: 現行の「名簿全員が毎回参加（0杯含む）」モデルを作り替えることになりスコープが大きい。将来「参加者を毎回選びたい」となったら別途検討
- **メアド紐付け**: 改名は id 安定で解決済み。メアド紐付けの本質は「自分の席」等の個人別機能で、アカウント無しの友達を数えられなくなる難点があり、今回の目的に不要

## 1. データモデル

`src/types/index.ts` の `Group.members` に `removed` フラグを追加（ソフト削除）。

```ts
members: { id: string; name: string; removed?: boolean }[];
```

- `removed: true` = 隠す（以前いたメンバー）/ 無し or `false` = 在籍中
- 既存グループは `removed` 無し＝在籍中扱い。**マイグレーション不要**
- パーティ内 `Member` 型は変更なし（過去スナップショットはそのまま保持される）

## 2. lib 層ロジック

### `src/lib/party.ts`

- `rosterOf(group)`: 在籍中（`!removed`）のみ返すよう変更。これにより集計・新規パーティ・割り勘が自動で「隠した人を除外」し、復活で再表示される
- 追加 `genMemberId()`: ASCII 安全かつ一意な id を生成（例 `m_${Date.now().toString(36)}${乱数}`）。先頭が文字、英数字＋アンダースコアのみ。`db.ts:175` の「member.id は Firestore フィールドパスに使うため安全なセグメントである前提」という注記をこれで満たす。あわせて当該コメントを更新
- `mergeMembers(current, incoming)`: 「incoming にしか居ないメンバーも取り込む」よう拡張。他端末で進行中パーティに追加された人を反映する。自分の入力中カウントを巻き戻さない既存挙動は維持（追加は加算のみで安全）

### `src/lib/db.ts`

- 追加 `updateGroupMembers(members)`: グループ doc の `members` 配列を更新（`updateDoc(groupRef, { members })`）。`removed` を含むフル配列を書き戻す。**配列で保存**する（parties の members マップとは別物。混同しないこと）
- 進行中パーティへの追加は既存 `updateMemberDrinks(partyId, member)` を流用（0 杯の `Member` を渡して `members.<id>` を部分更新）。専用関数は作らない

### 共通ヘルパー `addMember(name)`

管理画面と MembersTab の両方から呼ぶ。

1. `genMemberId()` で id 生成 → `group.members` に在籍として追加 → `updateGroupMembers`
2. `findActiveParty(historyData)` があれば、そのパーティにも 0 杯で `updateMemberDrinks`

## 3. UI

### 新ビュー `MemberManageView`

`AppView` に `'memberManage'` を追加。

- **在籍中メンバー**: 各行に名前（タップで改名インライン編集）＋「外す」ボタン
- **以前いたメンバー（removed）**: グレー表示＋「戻す」ボタン
- **「＋メンバーを追加」**: 名前入力＋追加ボタン。名前必須・trim、空不可。重複名は許容（id で区別）
- 入口:
  1. ホームのグループ設定カードに「メンバーを編集」ボタン
  2. 新規グループ作成直後に自動遷移

### 進行中パーティ（`MembersTab`）

「＋メンバーを追加」ショートカットを置く。名前入力 → `addMember` を呼び、その場で席が増える。

### 「外す」「戻す」と進行中パーティの関係

- **外す（remove）**: `removed: true` を立てるだけ。進行中の飲み会からは**消さない**（その夜の記録・カウントは保持）。効果は「次の新しい飲み会から除外」＋「メンバー別集計から非表示」
- **戻す（restore）**: `removed` を外す。`addMember` と同様に、進行中の飲み会に未参加なら 0 杯で追加（カスケード）

### 改名の挙動

id 据え置きで `name` のみ更新 → メンバー別集計の表示と今後のパーティに反映。過去パーティの編集画面は当時の名前のまま（スナップショット、許容）。

### 新規グループ作成（`GroupSetupView`）

`createGroup` のシードを `FIXED_MEMBERS` から**空名簿**に変更。作成後 `MemberManageView` へ誘導してメンバーを追加してもらう。

- グループ名（`Group.name`）は UI のどこにも表示されていない死にフィールドのため、**名前入力は追加しない（YAGNI）**。`createGroup` の名前引数はデフォルト値のままにし、シードのみ変更する

## 4. Firestore ルール（⚠️ 手動デプロイ必須）

`members` 配列の更新を許可する関数を追加。

```
function editsRoster(groupId) {
  return isMember(groupId) && changedKeys().hasOnly(['members']);
}
```

`allow update` に `|| editsRoster(groupId)` を追加する。進行中パーティへの追加は `parties` サブコレクションの `write`（既にメンバー許可済み）でカバーされる。

**重要**: ルールは `git push` では反映されない（`firestore-rules-deploy.md`）。`firebase deploy --only firestore:rules` を手動実行しないと、名簿編集が permission-denied で失敗する。このデプロイはユーザーが `! firebase deploy --only firestore:rules` で実行する。

## 5. 影響範囲（既存挙動の確認）

- `getMemberStats`: 変更不要。`rosterOf` が removed を除外するため集計から自動で消え、復活で再表示
- `createInitialMembers` / `defaultSplitRoles`: `rosterOf`（在籍中）経由なので新規パーティから removed が除外される
- `mergeMembers` 拡張: 既存のドリンク同期を維持しつつ新メンバー取り込みを追加（加算のみで安全）
- `emptyPartyState`（`rosterOf(null)`＝FIXED_MEMBERS フォールバック）: 初期/ログアウト時のみ。変更なし

## 6. テスト

### ユニット（`npm run test:unit`・emulator 不要）

- `rosterOf` が removed を除外する
- `genMemberId` がフィールドパス安全かつ一意
- `mergeMembers` が incoming-only メンバーを取り込み、かつ入力中カウントを巻き戻さない
- `getMemberStats` が removed を隠し、復活で再表示する

### emulator（`npm run test:emulators`）

- `updateGroupMembers` が members 配列を更新する／ルールが members のみの変更を許可する
- `addMember` が進行中パーティへ部分更新でカスケードする
- ルールが非メンバー・許可外キー変更を拒否する

## 7. スコープ外（YAGNI）

- メアド紐付け・「自分の席」ハイライト
- パーティごとの参加者選択（方針B）・ゲスト専用概念
- グループ名の表示/編集
- ログイン許可リスト（`allowedUsers`）の編集 — 別管理のまま
