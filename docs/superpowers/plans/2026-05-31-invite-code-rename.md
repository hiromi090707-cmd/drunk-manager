# 招待コードのリネーム機能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 既存グループの招待コードを、メンバーが後から好きな文字列に変更できるようにする。

**Architecture:** データ層 `db.ts` に正規化・長さ検証・ユニークチェック付きの `updateInviteCode` を追加し、HomeView の招待コード表示ブロックにインライン編集UIを足す。`parties` は groupId 紐付けのため履歴に影響しない。

**Tech Stack:** React 18 + TypeScript、Firebase Firestore、Vitest（Firebase Emulator 上で実行）

---

## File Structure

- Modify: `src/lib/db.ts` — `updateInviteCode(newCode)` を追加（既存 import で完結）
- Modify: `src/views/HomeView.tsx` — 招待コード表示ブロックにインライン編集UIを追加
- Test: `src/lib/db.test.ts` — `updateInviteCode` の emulator テスト2本

---

## Task 1: データ層 `updateInviteCode`（TDD）

**Files:**
- Modify: `src/lib/db.ts`
- Test: `src/lib/db.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/db.test.ts` の import に `updateInviteCode` を追加する。現在の import ブロック（17–27行目あたり）の `setActiveGroup,` の直後に1行足す:

```ts
  setActiveGroup,
  updateInviteCode,
```

そしてファイル末尾（`グループ切り替え後のリスナー` describe ブロックの閉じ `});` の後ろ）に新しい describe を追加する:

```ts
describe('招待コードのリネーム', () => {
  it('updateInviteCode で既存グループのコードを変更でき、大文字に正規化される', async () => {
    const group = await createGroup('リネームテスト', TEST_MEMBERS, USER_A.uid, USER_A.email, 'OLD001');

    const result = await updateInviteCode('new99');
    expect(result).toBe('NEW99');

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const snap = await ctx.firestore().collection('groups').doc(group.id).get();
      expect(snap.data()?.inviteCode).toBe('NEW99');
    });
  });

  it('他グループが使用中のコードへの変更は reject される', async () => {
    // 別グループ B を直接用意（コード TAKEN1）
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const ref = ctx.firestore().collection('groups').doc();
      await ref.set({
        name: 'B',
        memberUids: [USER_B.uid],
        memberEmails: [USER_B.email],
        members: TEST_MEMBERS,
        inviteCode: 'TAKEN1',
        claudeApiKey: '',
        createdBy: USER_B.uid,
      });
    });

    // A が自グループを作成し、B のコードへ変更しようとする
    await createGroup('A', TEST_MEMBERS, USER_A.uid, USER_A.email, 'MINE01');
    await expect(updateInviteCode('TAKEN1')).rejects.toThrow('すでに使われています');
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm run test:emulators`
Expected: FAIL（`updateInviteCode` が `./db` に存在しないため import エラー、または「is not a function」で新規2テストが赤）。既存テストはこの時点では通っている。

- [ ] **Step 3: 最小実装を書く**

`src/lib/db.ts` の `joinGroupByCode` 関数の直後（68行目の `}` の後ろ）に追加する。必要な `getDocs`/`query`/`collection`/`where`/`updateDoc`/`doc`/`db` はすべて既存 import 済み:

```ts
export async function updateInviteCode(newCode: string): Promise<string> {
  if (!activeGroupId) throw new Error('No active group');
  const code = newCode.trim().toUpperCase();
  if (code.length < 2 || code.length > 16) {
    throw new Error('招待コードは2〜16文字で入力してください。');
  }
  const existing = await getDocs(query(collection(db, 'groups'), where('inviteCode', '==', code)));
  const takenByOther = existing.docs.some((d) => d.id !== activeGroupId);
  if (takenByOther) throw new Error('この招待コードはすでに使われています。別のコードを指定してください。');
  await updateDoc(doc(db, 'groups', activeGroupId), { inviteCode: code });
  return code;
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm run test:emulators`
Expected: PASS（新規2テスト含め全テスト緑）

- [ ] **Step 5: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラーなし（`vite build` は型を見ないため別途必須）

- [ ] **Step 6: コミット**

```bash
git add src/lib/db.ts src/lib/db.test.ts
git commit -m "feat: 招待コードを変更する updateInviteCode を追加"
```

---

## Task 2: HomeView の招待コード編集UI

**Files:**
- Modify: `src/views/HomeView.tsx`

このタスクは RTL テストハーネスが無いため目視検証。型チェック＋ビルドで担保する。

- [ ] **Step 1: import を追加**

`src/views/HomeView.tsx` の先頭に React の `useState` を追加（現状 React import 行が無いので新規追加）:

```ts
import { useState } from 'react';
```

`db` の import 行を `updateInviteCode` 込みに変更する。現在:

```ts
import { cleanup, leaveGroup } from '../lib/db';
```

を次に置き換える:

```ts
import { cleanup, leaveGroup, updateInviteCode } from '../lib/db';
```

- [ ] **Step 2: state と保存ハンドラを追加**

`export function HomeView() {` 直後の `const user = auth.currentUser;` の下に追加:

```ts
  const [editingCode, setEditingCode] = useState(false);
  const [codeInput, setCodeInput] = useState('');

  async function handleSaveCode() {
    try {
      const updated = await updateInviteCode(codeInput);
      dispatch({ type: 'SET_GROUP', group: { ...state.groupInfo!, inviteCode: updated } });
      setEditingCode(false);
      alert(`招待コードを「${updated}」に変更しました。`);
    } catch (e) {
      alert(e instanceof Error ? e.message : '変更に失敗しました。');
    }
  }
```

- [ ] **Step 3: 招待コード表示ブロックを編集対応に差し替え**

現在の招待コードブロック（末尾の `{state.groupInfo?.inviteCode && ( ... )}`）の中身を差し替える。現在:

```tsx
      {state.groupInfo?.inviteCode && (
        <div className="glass p-3 mt-4">
          <p className="text-muted" style={{ fontSize: '0.7rem', marginBottom: '0.2rem' }}>招待コード</p>
          <span className="text-accent" style={{ letterSpacing: '0.2rem', fontWeight: 'bold' }}>
            {state.groupInfo.inviteCode}
          </span>
          <button
            onClick={handleLeaveGroup}
            className="btn btn-sm mt-3 w-full"
            style={{ fontSize: '0.8rem', color: 'var(--danger-color)', background: 'transparent', border: '1px solid var(--danger-color)' }}
          >
            このグループを退出する
          </button>
        </div>
      )}
```

を次に置き換える:

```tsx
      {state.groupInfo?.inviteCode && (
        <div className="glass p-3 mt-4">
          <p className="text-muted" style={{ fontSize: '0.7rem', marginBottom: '0.2rem' }}>招待コード</p>
          {editingCode ? (
            <div className="flex" style={{ gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="text"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                className="input-field text-accent"
                style={{ flex: 1, minWidth: 0, letterSpacing: '0.2rem', fontWeight: 'bold', textTransform: 'uppercase' }}
                maxLength={16}
                autoFocus
              />
              <button onClick={handleSaveCode} className="btn btn-sm text-accent" style={{ fontWeight: 'bold' }}>保存</button>
              <button onClick={() => setEditingCode(false)} className="btn btn-sm btn-ghost text-muted">取消</button>
            </div>
          ) : (
            <div className="flex justify-between items-center">
              <span className="text-accent" style={{ letterSpacing: '0.2rem', fontWeight: 'bold' }}>
                {state.groupInfo.inviteCode}
              </span>
              <button
                onClick={() => { setCodeInput(state.groupInfo!.inviteCode); setEditingCode(true); }}
                className="btn btn-sm btn-ghost text-muted"
                style={{ fontSize: '0.75rem' }}
              >
                変更
              </button>
            </div>
          )}
          <button
            onClick={handleLeaveGroup}
            className="btn btn-sm mt-3 w-full"
            style={{ fontSize: '0.8rem', color: 'var(--danger-color)', background: 'transparent', border: '1px solid var(--danger-color)' }}
          >
            このグループを退出する
          </button>
        </div>
      )}
```

- [ ] **Step 4: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 5: ビルド**

Run: `npm run build`
Expected: エラーなしで完了

- [ ] **Step 6: コミット**

```bash
git add src/views/HomeView.tsx
git commit -m "feat: HomeViewに招待コードの変更UIを追加"
```

---

## 完了後

- 全テスト（emulator）緑・`tsc --noEmit` クリーン・`npm run build` 成功を確認
- finishing-a-development-branch で main へマージ → デプロイ後に公開ページで目視（招待コード横の「変更」→ 入力 → 保存 → 反映、重複コードでエラー表示）
