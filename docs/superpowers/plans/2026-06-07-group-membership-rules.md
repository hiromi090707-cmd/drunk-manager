# グループ参加・退会・権限のFirestoreルール見直し 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新メンバーが招待コードで自分自身を `memberUids` に追加して参加できるようにし、`groups` 更新を操作種別ごとの最小権限ルールに厳格化する。

**Architecture:** `firestore.rules` の `groups` 更新を join / leave / 設定変更の3分岐に分割し、各分岐で変更可能フィールドを制限する。`token.email` を強制して email 詐称を防ぐ。クライアントは email 必須化。ルールの正常系は db.ts 関数を本番フロー（認証主体を切替）で、拒否系は `rules-unit-testing` の raw context で検証する。

**Tech Stack:** Firestore Security Rules v2、Firebase Emulator（auth:9099 / firestore:8080）、Vitest、`@firebase/rules-unit-testing`、React + TypeScript。

**設計spec:** `docs/superpowers/specs/2026-06-07-group-membership-rules-design.md`

---

## 前提: Emulator の起動とテスト実行

ルールのテストは Firebase Emulator が必須。**ターミナルA**で起動しっぱなしにする:

```bash
npm run emulators        # auth(9099) / firestore(8080) を起動。firestore.rules をロード
```

テストは**ターミナルB**で実行する:

```bash
npx vitest run src/lib/db.test.ts -t 'テスト名の一部'   # 個別テスト
npx vitest run src/lib/db.test.ts                       # db.test.ts 全体
```

> **重要:** `db.test.ts` の `beforeAll` は `initializeTestEnvironment` で `firestore.rules` を `readFileSync` し emulator にロードし直す。よって**ルールを編集したらテストを再実行するだけで最新ルールが反映される**（emulator の再起動は不要）。

emulator を常駐させたくない場合の代替（起動→全テスト→終了、遅い・個別指定不可）:

```bash
npm run test:emulators
```

## File Structure

| ファイル | 責務 | 変更内容 |
|---------|------|---------|
| `firestore.rules` | Firestore セキュリティルール | `groups` 更新を3分岐化、`create` 厳格化（Task 1〜3） |
| `src/lib/db.test.ts` | db.ts とルールの統合/単体テスト | ユーザー切替ヘルパー追加、join テスト本番フロー化、拒否系テスト追加（Task 1〜3） |
| `src/lib/db.ts` | Firestore 操作 | `leaveGroup` の email 必須化（Task 4） |
| `src/views/GroupSetupView.tsx` | グループ作成/参加 UI | join 前の email 非 null チェック（Task 4） |
| `src/views/HomeView.tsx` | ホーム（退会含む） | leave 前の email 非 null チェック（Task 4） |

---

## Task 1: 参加（joinsSelf）— 新メンバー本人が招待コードで参加できる

**Files:**
- Modify: `src/lib/db.test.ts`（import、ヘルパー、`beforeAll`、`afterEach`、join テスト）
- Modify: `firestore.rules:9-19`（関数追加）, `firestore.rules:32`（update 行）

- [ ] **Step 1: テスト基盤を追加（import・ヘルパー・beforeAll・afterEach）**

`src/lib/db.test.ts` の import を差し替え（`assertFails`/`assertSucceeds` を追加）:

```typescript
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
```

`USER_A`/`USER_B` 定義の直後（`let testEnv` の前後）に、サインイン切替ヘルパーを追加:

```typescript
// 指定ユーザーで Auth Emulator にサインインし、実 uid を反映する。
// db.ts の関数はこの認証主体（auth.currentUser）でルール評価される。
async function signInAs(user: { email: string; uid: string }): Promise<void> {
  let cred;
  try {
    cred = await createUserWithEmailAndPassword(auth, user.email, 'password');
  } catch {
    cred = await signInWithEmailAndPassword(auth, user.email, 'password');
  }
  user.uid = cred.user.uid;
}
```

`beforeAll` 内の USER_A サインイン部分（現状の `try/catch` ブロック）を、両ユーザーの uid 確定に置き換える:

```typescript
  // USER_A / USER_B 両方を Auth Emulator に用意し、実 uid を確定。
  // 既定の認証主体は USER_A に戻しておく。
  await signInAs(USER_A);
  await signInAs(USER_B);
  await signInAs(USER_A);
```

`afterEach` の末尾（`allowedUsers` 再投入の後）に、認証主体を USER_A に戻す処理を追加:

```typescript
  // テスト内で USER_B に切り替えていても、次テストは USER_A 前提に戻す
  await signInAs(USER_A);
```

- [ ] **Step 2: join 成功テストを本番フローに書き換え（failing test）**

`src/lib/db.test.ts:148-171` の `it('joinGroupByCode で別ユーザーが既存グループに参加できる', ...)` を以下に置き換える:

```typescript
  it('joinGroupByCode で新メンバー本人が招待コードで参加できる', async () => {
    // USER_A がグループ作成
    await signInAs(USER_A);
    const groupA = await createGroup(
      'テストグループ',
      TEST_MEMBERS,
      USER_A.uid,
      USER_A.email,
      'JOIN01',
    );

    // USER_B 本人としてサインインし直して参加（本番フローの再現）
    await signInAs(USER_B);
    const joined = await joinGroupByCode('JOIN01', USER_B.uid, USER_B.email);

    expect(joined.id).toBe(groupA.id);
    expect(getActiveGroup()).toBe(groupA.id);

    // memberUids/memberEmails に B が追加されたことをルール無効化で直接確認
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const snap = await ctx.firestore().collection('groups').doc(groupA.id).get();
      const data = snap.data();
      expect(data?.memberUids).toContain(USER_A.uid);
      expect(data?.memberUids).toContain(USER_B.uid);
      expect(data?.memberEmails).toContain(USER_B.email);
    });
  });
```

- [ ] **Step 3: テスト実行で失敗を確認**

Run: `npx vitest run src/lib/db.test.ts -t '新メンバー本人が招待コード'`
Expected: FAIL。`joinGroupByCode` の `updateDoc` が `permission-denied`（USER_B はまだ `isMember` でないため現行ルールが拒否）。

- [ ] **Step 4: ルールに changedKeys() と joinsSelf() を追加**

`firestore.rules` の `isMember` 関数（19行目の `}` ）の直後に2つの関数を追加:

```js
    // 変更されたトップレベルキーの集合
    function changedKeys() {
      return request.resource.data.diff(resource.data).affectedKeys();
    }

    // 参加: 自分の uid/email だけを追加（他人の uid・email 詐称は不可）
    function joinsSelf() {
      return changedKeys().hasOnly(['memberUids', 'memberEmails'])
        && !(request.auth.uid in resource.data.memberUids)
        && request.resource.data.memberUids.toSet()
             == resource.data.memberUids.toSet().union([request.auth.uid].toSet())
        && request.resource.data.memberEmails.toSet()
             == resource.data.memberEmails.toSet().union([request.auth.token.email].toSet());
    }
```

`firestore.rules:32` の update 行を、join を許可する形に変更（既存メンバーの更新は `isMember` で温存）:

```js
      allow update: if isAllowed() && (joinsSelf() || isMember(groupId));
```

- [ ] **Step 5: テスト実行で成功を確認**

Run: `npx vitest run src/lib/db.test.ts -t '新メンバー本人が招待コード'`
Expected: PASS。

- [ ] **Step 6: 参加なりすましの拒否テストを追加**

`it('joinGroupByCode で新メンバー本人...')` の直後に2つ追加:

```typescript
  it('参加時に他人のuidを混ぜると拒否される', async () => {
    await signInAs(USER_A);
    const group = await createGroup('G', TEST_MEMBERS, USER_A.uid, USER_A.email, 'EVIL01');

    // USER_B のコンテキストで、自分 + 架空uid を追加しようとする
    const bCtx = testEnv.authenticatedContext(USER_B.uid, { email: USER_B.email });
    await assertFails(
      bCtx.firestore().collection('groups').doc(group.id).update({
        memberUids: [USER_A.uid, USER_B.uid, 'uid-ghost'],
        memberEmails: [USER_A.email, USER_B.email, 'ghost@example.com'],
      }),
    );
  });

  it('参加時に他人のemailを詐称すると拒否される', async () => {
    await signInAs(USER_A);
    const group = await createGroup('G', TEST_MEMBERS, USER_A.uid, USER_A.email, 'EVIL02');

    const bCtx = testEnv.authenticatedContext(USER_B.uid, { email: USER_B.email });
    await assertFails(
      bCtx.firestore().collection('groups').doc(group.id).update({
        memberUids: [USER_A.uid, USER_B.uid],
        memberEmails: [USER_A.email, 'evil@example.com'],
      }),
    );
  });
```

- [ ] **Step 7: テスト実行で成功を確認**

Run: `npx vitest run src/lib/db.test.ts -t '参加時に'`
Expected: PASS（`joinsSelf` が uid 混入・email 詐称をどちらも拒否する。failing フェーズなし＝回帰防止テスト）。

- [ ] **Step 8: Commit**

```bash
git add firestore.rules src/lib/db.test.ts
git commit -m "feat: 招待コードで新メンバー本人が参加できるルールを追加"
```

---

## Task 2: 退会・設定変更の厳格化（leavesSelf / editsSettings）— isMember 全許可を撤廃

`isMember(groupId)` による「メンバーなら何でも更新可」を、`leavesSelf()`（自分の退会）と `editsSettings()`（招待コード/APIキーのみ）に分割置換する。

**Files:**
- Modify: `firestore.rules`（関数追加, update 行）
- Modify: `src/lib/db.test.ts`（拒否テスト追加）

- [ ] **Step 1: 改ざん・他人削除の拒否テストを追加（failing test）**

`src/lib/db.test.ts` の `describe('グループ作成・参加', ...)` の閉じ括弧の後に、新しい describe を追加:

```typescript
describe('groups 更新ルールの最小権限', () => {
  it('メンバーでも name は変更できない', async () => {
    await signInAs(USER_A);
    const group = await createGroup('元の名前', TEST_MEMBERS, USER_A.uid, USER_A.email, 'NAME01');

    const aCtx = testEnv.authenticatedContext(USER_A.uid, { email: USER_A.email });
    await assertFails(
      aCtx.firestore().collection('groups').doc(group.id).update({ name: '改ざん' }),
    );
  });

  it('メンバーは他人を memberUids から削除できない', async () => {
    // A, B がメンバーのグループをルール無効化で用意
    let groupId = '';
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const ref = ctx.firestore().collection('groups').doc();
      await ref.set({
        name: 'G',
        memberUids: [USER_A.uid, USER_B.uid],
        memberEmails: [USER_A.email, USER_B.email],
        members: TEST_MEMBERS,
        inviteCode: 'DELME1',
        claudeApiKey: '',
        createdBy: USER_A.uid,
      });
      groupId = ref.id;
    });

    // A が B を削除しようとする（自分以外の削除）
    const aCtx = testEnv.authenticatedContext(USER_A.uid, { email: USER_A.email });
    await assertFails(
      aCtx.firestore().collection('groups').doc(groupId).update({
        memberUids: [USER_A.uid],
        memberEmails: [USER_A.email],
      }),
    );
  });

  it('メンバー本人は退会（自分の削除）できる', async () => {
    await signInAs(USER_A);
    const group = await createGroup('G', TEST_MEMBERS, USER_A.uid, USER_A.email, 'LEAVE1');

    const aCtx = testEnv.authenticatedContext(USER_A.uid, { email: USER_A.email });
    await assertSucceeds(
      aCtx.firestore().collection('groups').doc(group.id).update({
        memberUids: [],
        memberEmails: [],
      }),
    );
  });
});
```

- [ ] **Step 2: テスト実行で失敗を確認**

Run: `npx vitest run src/lib/db.test.ts -t '最小権限'`
Expected: FAIL。現行ルール（`isMember` 全許可）では「name 変更」「他人削除」が通ってしまい、`assertFails` が失敗する。

- [ ] **Step 3: ルールに leavesSelf() と editsSettings() を追加**

`firestore.rules` の `joinsSelf()` 関数の直後に追加:

```js
    // 退会: 自分の uid/email だけを削除
    function leavesSelf() {
      return changedKeys().hasOnly(['memberUids', 'memberEmails'])
        && (request.auth.uid in resource.data.memberUids)
        && request.resource.data.memberUids.toSet()
             == resource.data.memberUids.toSet().difference([request.auth.uid].toSet())
        && request.resource.data.memberEmails.toSet()
             == resource.data.memberEmails.toSet().difference([request.auth.token.email].toSet());
    }

    // 設定変更: 既存メンバーが招待コード / Claude APIキー のみ変更
    function editsSettings(groupId) {
      return isMember(groupId)
        && changedKeys().hasOnly(['inviteCode', 'claudeApiKey']);
    }
```

- [ ] **Step 4: update 行を最終形（3分岐）に変更**

`firestore.rules` の update 行を以下に変更（`isMember` 単独を撤廃）:

```js
      allow update: if isAllowed() && (joinsSelf() || leavesSelf() || editsSettings(groupId));
```

- [ ] **Step 5: テスト実行で成功を確認（新規 + 既存の回帰なし）**

Run: `npx vitest run src/lib/db.test.ts`
Expected: PASS（全テスト）。特に確認:
- `最小権限`: name 変更・他人削除が拒否、自分の退会は成功
- 既存 `招待コードのリネーム`（`updateInviteCode`）が `editsSettings` 経由で PASS
- 既存 `グループ切り替え後のリスナー` の `leaveGroup(USER_A...)` が `leavesSelf` 経由で PASS

- [ ] **Step 6: Commit**

```bash
git add firestore.rules src/lib/db.test.ts
git commit -m "feat: groups更新を退会/設定変更の最小権限ルールに厳格化"
```

---

## Task 3: 作成（create）の厳格化 — 作成者本人だけが初期メンバー

**Files:**
- Modify: `firestore.rules`（create 行）
- Modify: `src/lib/db.test.ts`（allowed外拒否テスト追加）

- [ ] **Step 1: allowedリスト外ユーザーの作成拒否テストを追加（failing test）**

`describe('groups 更新ルールの最小権限', ...)` の中の末尾に追加:

```typescript
  it('allowedリスト外のユーザーはグループを作成できない', async () => {
    const outsider = testEnv.authenticatedContext('uid-outsider', {
      email: 'outsider@example.com',
    });
    await assertFails(
      outsider.firestore().collection('groups').doc().set({
        name: 'X',
        memberUids: ['uid-outsider'],
        memberEmails: ['outsider@example.com'],
        members: TEST_MEMBERS,
        inviteCode: 'OUT001',
        claudeApiKey: '',
        createdBy: 'uid-outsider',
      }),
    );
  });

  it('作成時に他人を初期メンバーに含めることはできない', async () => {
    // allowed な USER_A が、memberUids に別人を入れて作成しようとする
    const aCtx = testEnv.authenticatedContext(USER_A.uid, { email: USER_A.email });
    await assertFails(
      aCtx.firestore().collection('groups').doc().set({
        name: 'X',
        memberUids: [USER_A.uid, USER_B.uid],
        memberEmails: [USER_A.email, USER_B.email],
        members: TEST_MEMBERS,
        inviteCode: 'OUT002',
        claudeApiKey: '',
        createdBy: USER_A.uid,
      }),
    );
  });
```

- [ ] **Step 2: テスト実行で結果を確認**

Run: `npx vitest run src/lib/db.test.ts -t '作成'`
Expected: 「allowedリスト外」は現行ルールでも PASS（`isAllowed` で既に拒否）。「他人を初期メンバー」は FAIL（現行 create は `uid in memberUids` だけなので別人同梱が通ってしまう）。

- [ ] **Step 3: create ルールを厳格化**

`firestore.rules` の create 行を以下に変更:

```js
      allow create: if isAllowed()
                       && request.resource.data.memberUids == [request.auth.uid]
                       && request.resource.data.memberEmails == [request.auth.token.email];
```

- [ ] **Step 4: テスト実行で成功を確認**

Run: `npx vitest run src/lib/db.test.ts`
Expected: PASS（全テスト）。既存 `createGroup`（`[USER_A.uid]`/`[USER_A.email]` で作成）が PASS のままであることも確認。

- [ ] **Step 5: Commit**

```bash
git add firestore.rules src/lib/db.test.ts
git commit -m "feat: グループ作成を作成者本人のみ初期メンバーに厳格化"
```

---

## Task 4: クライアントの email 必須化

ルールが `token.email` を強制するため、`email` が空だと参加・退会が拒否される。空なら操作を中断する。

**Files:**
- Modify: `src/lib/db.ts:102-108`（`leaveGroup`）
- Modify: `src/views/GroupSetupView.tsx:29-41`（`handleJoinGroup`）
- Modify: `src/views/HomeView.tsx:47` 周辺（退会処理）

- [ ] **Step 1: leaveGroup の email 必須化テストを追加**

`src/lib/db.test.ts` の `describe('groups 更新ルールの最小権限', ...)` 内に追加:

```typescript
  it('leaveGroup は memberUids と memberEmails の両方から本人を削除する', async () => {
    // A, B がメンバーのグループを用意し、A が leaveGroup
    let groupId = '';
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const ref = ctx.firestore().collection('groups').doc();
      await ref.set({
        name: 'G',
        memberUids: [USER_A.uid, USER_B.uid],
        memberEmails: [USER_A.email, USER_B.email],
        members: TEST_MEMBERS,
        inviteCode: 'LV0001',
        claudeApiKey: '',
        createdBy: USER_A.uid,
      });
      groupId = ref.id;
    });

    await signInAs(USER_A);
    setActiveGroup(groupId);
    await leaveGroup(USER_A.uid, USER_A.email);

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const snap = await ctx.firestore().collection('groups').doc(groupId).get();
      const data = snap.data();
      expect(data?.memberUids).not.toContain(USER_A.uid);
      expect(data?.memberEmails).not.toContain(USER_A.email);
      expect(data?.memberUids).toContain(USER_B.uid);
    });
  });
```

- [ ] **Step 2: テスト実行で成功を確認（現状の leaveGroup でも email を渡せば通る）**

Run: `npx vitest run src/lib/db.test.ts -t 'leaveGroup は memberUids'`
Expected: PASS（このテストは email を渡しているため現実装でも通る。回帰防止＋次の実装変更の安全網）。

- [ ] **Step 3: leaveGroup を email 必須前提に簡素化**

`src/lib/db.ts:102-108` の `leaveGroup` を以下に変更:

```typescript
export async function leaveGroup(uid: string, email: string): Promise<void> {
  if (!activeGroupId) return;
  await updateDoc(doc(db, 'groups', activeGroupId), {
    memberUids: arrayRemove(uid),
    memberEmails: arrayRemove(email),
  });
  activeGroupId = null;
}
```

- [ ] **Step 4: テスト実行で成功を確認**

Run: `npx vitest run src/lib/db.test.ts -t 'leaveGroup は memberUids'`
Expected: PASS。

- [ ] **Step 5: GroupSetupView で参加前に email を保証**

`src/views/GroupSetupView.tsx:29-41` の `handleJoinGroup` を、`user.email` チェックを加えた形に変更:

```typescript
  async function handleJoinGroup() {
    const user = auth.currentUser;
    const code = inviteCode.trim().toUpperCase();
    if (!user || !code) return alert('招待コードを入力してください。');
    if (!user.email) return alert('メールアドレスが取得できませんでした。再ログインしてください。');
    try {
      const group = await joinGroupByCode(code, user.uid, user.email);
      dispatch({ type: 'SET_GROUP', group });
      listenToParties((parties) => dispatch({ type: 'SET_HISTORY', parties }));
      dispatch({ type: 'SET_VIEW', view: 'home' });
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : 'グループへの参加に失敗しました。');
    }
  }
```

- [ ] **Step 6: HomeView で退会前に email を保証**

`src/views/HomeView.tsx:47` の `await leaveGroup(user.uid, user.email ?? '');` を含む退会ハンドラを修正する。`user` 取得直後に以下のガードを追加し、`leaveGroup` には `user.email` を渡す:

```typescript
    if (!user.email) {
      alert('メールアドレスが取得できませんでした。再ログインしてください。');
      return;
    }
    await leaveGroup(user.uid, user.email);
```

（`user` が `auth.currentUser` で null チェック済みである前提。null チェックが未実施なら `const user = auth.currentUser; if (!user) return;` を先に置く。）

- [ ] **Step 7: ビルドと全テストで確認**

Run: `npm run build`
Expected: 型エラーなし（`user.email ?? ''` を消したことで `string` が渡ることを確認）。

Run: `npx vitest run src/lib/db.test.ts`
Expected: PASS（全テスト）。

- [ ] **Step 8: Commit**

```bash
git add src/lib/db.ts src/views/GroupSetupView.tsx src/views/HomeView.tsx src/lib/db.test.ts
git commit -m "feat: 参加・退会でメールアドレスを必須化しルールに適合させる"
```

---

## Task 5: 最終確認とデプロイ手順

**Files:** なし（検証とデプロイのみ）

- [ ] **Step 1: 全テストを emulator で実行**

Run: `npm run test:emulators`
Expected: PASS（全テスト緑。emulator 起動から自動実行）。

- [ ] **Step 2: 本番ビルド確認**

Run: `npm run build`
Expected: エラーなし。

- [ ] **Step 3: 既存グループの memberEmails を確認（リスク対応）**

Firebase Console → Firestore → `groups` の各ドキュメントに `memberEmails` フィールドが存在することを確認する。存在しない古いグループがあれば、`memberUids` に対応する email を Console で補完する（無いと `joinsSelf`/`leavesSelf` が参照エラーで失敗するため）。

- [ ] **Step 4: ルールを本番にデプロイ（ユーザーが実行）**

```bash
firebase deploy --only firestore:rules
```

または Firebase Console のルールエディタに `firestore.rules` の内容を貼り付けて公開する。

- [ ] **Step 5: 本番で新メンバー参加を実機確認**

新メンバーの email を `config/allowedUsers.emails` に追加済みであることを確認の上、新メンバーが Google ログイン → 招待コードで参加 → 飲み会記録の読み書きができることを確認する。

---

## Self-Review チェック結果

- **Spec coverage:** ルール3分岐（Task 1,2）、create 厳格化（Task 3）、email 必須化（Task 4）、テスト2層＝正常系は db.ts 経由・拒否系は raw context（Task 1〜4）、デプロイ手順とリスク（Task 5）。spec の全項目に対応タスクあり。
- **Placeholder scan:** 各ステップに実コード・実コマンド・期待結果を記載。プレースホルダなし。
- **Type consistency:** ヘルパー名 `signInAs`、ルール関数 `changedKeys`/`joinsSelf`/`leavesSelf`/`editsSettings` を全タスクで一貫使用。`leaveGroup(uid, email)` のシグネチャは変更せず（呼び出し側で email 非 null を保証）。
