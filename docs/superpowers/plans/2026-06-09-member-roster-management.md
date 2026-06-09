# メンバー名簿管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** グループのメンバー名簿を追加・ソフト削除（隠す）・復活・改名できるようにし、新規グループは空名簿から自分たちのメンバーで始められるようにする。

**Architecture:** 名簿（`Group.members`）を唯一の真実とし、純粋なロスター操作は `src/lib/roster.ts` に集約（ユニットテスト可能）、副作用（Firestore書込＋dispatch）は `useRoster` フックに閉じ込める。削除は `removed` フラグのソフト削除。名簿への追加は進行中パーティへもカスケード（既存 `updateMemberDrinks` を流用）。

**Tech Stack:** React 18 + TypeScript + Vite / Firebase Firestore / Vitest（`@firebase/rules-unit-testing`）

参照スペック: `docs/superpowers/specs/2026-06-09-member-roster-management-design.md`

---

## ファイル構成

| ファイル | 役割 | 操作 |
|---------|------|------|
| `src/types/index.ts` | `GroupMember` 型追加・`Group.members` 型変更 | Modify |
| `src/lib/roster.ts` | 純粋なロスター操作（id生成・追加・削除・復活・改名・在籍フィルタ） | Create |
| `src/lib/roster.test.ts` | roster.ts のユニットテスト | Create |
| `src/lib/party.ts` | `rosterOf` の空/null 区別・`mergeMembers` 拡張・`zeroMember` 追加 | Modify |
| `src/lib/party.test.ts` | 既存テスト修正＋新規テスト | Modify |
| `src/lib/db.ts` | `updateGroupMembers` 追加・`createGroup` 引数型 | Modify |
| `src/lib/db.test.ts` | 名簿編集・ルール・カスケードの emulator テスト | Modify |
| `firestore.rules` | `editsRoster` 追加（⚠️ 手動デプロイ） | Modify |
| `src/hooks/useRoster.ts` | 名簿操作の副作用グルー（書込＋dispatch＋カスケード） | Create |
| `src/views/MemberManageView.tsx` | メンバー管理画面 | Create |
| `src/App.tsx` | `memberManage` ビューのルーティング | Modify |
| `src/views/HomeView.tsx` | 「メンバーを編集」導線＋空名簿スタートガード | Modify |
| `src/views/GroupSetupView.tsx` | 空名簿でグループ作成→管理画面へ誘導 | Modify |
| `src/views/PartyView/MembersTab.tsx` | 進行中の「＋メンバーを追加」 | Modify |
| `package.json` | `test:unit` に roster.test.ts 追加 | Modify |

**設計上の補足（スペックからの精緻化）:** `rosterOf` は「group が null のときだけ FIXED_MEMBERS にフォールバック」する。group が存在して名簿が空（新規グループ）の場合は空ロスターを尊重する。現行の `group?.members?.length ? ... : FALLBACK` のままだと空名簿の新グループに既存5人が出てしまうため。

---

## Task 1: 型変更と roster.ts 純粋関数

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/lib/roster.ts`
- Create: `src/lib/roster.test.ts`
- Modify: `package.json`

- [ ] **Step 1: `package.json` の test:unit に roster.test.ts を追加**

`scripts` の該当行を次に置換:

```json
    "test:unit": "SKIP_EMULATOR_CHECK=1 vitest run src/lib/alcohol.test.ts src/lib/party.test.ts src/lib/roster.test.ts src/lib/onboarding.test.ts",
```

- [ ] **Step 2: `src/types/index.ts` に `GroupMember` を追加し `Group.members` を変更**

`Group` インターフェースの直前に追加:

```ts
export interface GroupMember {
  id: string;
  name: string;
  removed?: boolean;
}
```

`Group` の `members` 行を次に変更:

```ts
  members: GroupMember[];
```

- [ ] **Step 3: roster.ts の失敗するテストを書く**

`src/lib/roster.test.ts` を新規作成:

```ts
import { describe, it, expect } from 'vitest';
import {
  genMemberId,
  activeRoster,
  addMemberToRoster,
  removeFromRoster,
  restoreToRoster,
  renameInRoster,
} from './roster';
import type { GroupMember } from '../types';

const roster: GroupMember[] = [
  { id: 'm1', name: 'あ' },
  { id: 'm2', name: 'い', removed: true },
  { id: 'm3', name: 'う' },
];

describe('genMemberId', () => {
  it('フィールドパス安全（先頭が文字・英数字とアンダースコアのみ）', () => {
    expect(genMemberId()).toMatch(/^m_[0-9a-z]+$/);
  });
  it('呼ぶたびに異なる id を返す', () => {
    const ids = new Set(Array.from({ length: 100 }, () => genMemberId()));
    expect(ids.size).toBe(100);
  });
});

describe('activeRoster', () => {
  it('removed のメンバーを除外する', () => {
    expect(activeRoster(roster).map((m) => m.id)).toEqual(['m1', 'm3']);
  });
});

describe('addMemberToRoster', () => {
  it('在籍メンバーとして末尾に追加し、追加分を返す', () => {
    const { members, added } = addMemberToRoster(roster, '  えお  ');
    expect(added.name).toBe('えお'); // trim される
    expect(added.removed).toBeUndefined();
    expect(members).toHaveLength(4);
    expect(members[3].id).toBe(added.id);
  });
});

describe('removeFromRoster', () => {
  it('指定 id に removed=true を立てる（他は不変）', () => {
    const next = removeFromRoster(roster, 'm1');
    expect(next.find((m) => m.id === 'm1')!.removed).toBe(true);
    expect(next.find((m) => m.id === 'm3')!.removed).toBeUndefined();
  });
});

describe('restoreToRoster', () => {
  it('指定 id の removed を false に戻す', () => {
    const next = restoreToRoster(roster, 'm2');
    expect(next.find((m) => m.id === 'm2')!.removed).toBe(false);
    expect(activeRoster(next).map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
  });
});

describe('renameInRoster', () => {
  it('指定 id の name のみ更新（id 据え置き・trim）', () => {
    const next = renameInRoster(roster, 'm1', '  かき  ');
    const m = next.find((x) => x.id === 'm1')!;
    expect(m.id).toBe('m1');
    expect(m.name).toBe('かき');
  });
});
```

- [ ] **Step 4: テストを実行して失敗を確認**

Run: `npm run test:unit`
Expected: FAIL（`./roster` が存在しない / 関数未定義）

- [ ] **Step 5: roster.ts を実装**

`src/lib/roster.ts` を新規作成:

```ts
import type { GroupMember } from '../types';

// ASCII 安全（先頭が文字・英数字とアンダースコアのみ）で一意な id を生成する。
// id は Firestore のフィールドパス（members.<id>）に使うため、日本語名からは作らない。
export function genMemberId(): string {
  return `m_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// 在籍中（removed でない）メンバーだけを返す。
export function activeRoster(members: readonly GroupMember[]): GroupMember[] {
  return members.filter((m) => !m.removed);
}

// 新メンバーを在籍として末尾に追加し、追加した GroupMember も返す。
export function addMemberToRoster(
  members: GroupMember[],
  name: string,
): { members: GroupMember[]; added: GroupMember } {
  const added: GroupMember = { id: genMemberId(), name: name.trim() };
  return { members: [...members, added], added };
}

// ソフト削除（removed=true）。他メンバーは不変。
export function removeFromRoster(members: GroupMember[], id: string): GroupMember[] {
  return members.map((m) => (m.id === id ? { ...m, removed: true } : m));
}

// 復活（removed=false）。
export function restoreToRoster(members: GroupMember[], id: string): GroupMember[] {
  return members.map((m) => (m.id === id ? { ...m, removed: false } : m));
}

// 改名（id 据え置き・name のみ）。
export function renameInRoster(members: GroupMember[], id: string, name: string): GroupMember[] {
  return members.map((m) => (m.id === id ? { ...m, name: name.trim() } : m));
}
```

- [ ] **Step 6: テストを実行して成功を確認**

Run: `npm run test:unit`
Expected: PASS（roster 関連がすべて green）

- [ ] **Step 7: コミット**

```bash
git add src/types/index.ts src/lib/roster.ts src/lib/roster.test.ts package.json
git commit -m "feat: ロスター操作の純粋関数とGroupMember型を追加"
```

---

## Task 2: party.ts（rosterOf 修正・mergeMembers 拡張・zeroMember）

**Files:**
- Modify: `src/lib/party.ts`
- Modify: `src/lib/party.test.ts`

- [ ] **Step 1: party.test.ts に新規テストを追加し、既存テストを修正**

`src/lib/party.test.ts` の import 行を次に置換（`rosterOf`・`zeroMember` を追加、`Group`・`GroupMember` 型も）:

```ts
import { membersToArray, membersToMap, mergeMembers, findActiveParty, rosterOf, zeroMember } from './party';
import type { Group, Member, Party } from '../types';
```

`mergeMembers` の describe 内、`'incoming にしか無いメンバーは取り込まない（固定ロスター前提）'` の `it(...)` ブロックを次に**置換**（挙動が反転する）:

```ts
  it('incoming にしか無いメンバーも取り込む（途中参加に対応）', () => {
    const current = [m('x', 1)];
    const incoming = [m('x', 1), m('z', 9)];
    const { merged, changed } = mergeMembers(current, incoming);
    expect(merged.map((p) => p.id)).toEqual(['x', 'z']);
    expect(changed).toBe(true);
  });
```

ファイル末尾に次の describe を追加:

```ts
describe('rosterOf', () => {
  const mkGroup = (members: Group['members']): Group => ({
    id: 'g', name: '', memberUids: [], memberEmails: [], members, inviteCode: '',
  });

  it('group が null のときは FIXED_MEMBERS にフォールバックする', () => {
    expect(rosterOf(null).length).toBeGreaterThan(0);
  });

  it('group があれば名簿が空でも空ロスターを返す（FIXED_MEMBERS に戻さない）', () => {
    expect(rosterOf(mkGroup([]))).toEqual([]);
  });

  it('removed のメンバーを除外する', () => {
    const g = mkGroup([{ id: 'a', name: 'A' }, { id: 'b', name: 'B', removed: true }]);
    expect(rosterOf(g).map((m) => m.id)).toEqual(['a']);
  });
});

describe('zeroMember', () => {
  it('全ドリンク0の Member を作る', () => {
    const z = zeroMember({ id: 'z', name: 'Z' });
    expect(z.totalDrinks).toBe(0);
    expect(z.drinks).toEqual({ beer: 0, highball: 0, sour: 0, other: 0 });
    expect(z.megaDrinks).toEqual({ beer: 0, highball: 0, sour: 0, other: 0 });
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm run test:unit`
Expected: FAIL（`rosterOf` の空/null 挙動・`mergeMembers` の incoming 取り込み・`zeroMember` 未エクスポート）

- [ ] **Step 3: party.ts を修正**

`src/lib/party.ts` の import 行に `activeRoster` を追加:

```ts
import { activeRoster } from './roster';
```

`rosterOf` 関数を次に**置換**:

```ts
// group が null のとき（初期/ログアウト時）だけ FIXED_MEMBERS にフォールバックする。
// group があれば、たとえ名簿が空（新規グループ）でもそれを尊重し、removed は除外する。
export function rosterOf(group: Group | null): Roster {
  if (!group) return [...FIXED_MEMBERS];
  return activeRoster(group.members ?? []);
}
```

`mergeMembers` 関数を次に**置換**（コメントも更新）:

```ts
// 購読で受け取ったサーバー由来の members を、現在のローカル members にメンバー単位でマージする。
// 変化があったメンバーだけ差し替えるため、自分が入力中（楽観更新済み）のメンバーは保持されやすい。
// incoming にしか居ないメンバー（他端末で途中追加された人）は末尾に取り込む。
// 既知の制限: 同一メンバーを高速連打すると、確定前の古いサーバースナップショットが一瞬反映されて
// カウントが揺れることがあるが、最終的に最新値へ収束する（恒久的なズレは生じない）。
export function mergeMembers(
  current: Member[],
  incoming: Member[],
): { merged: Member[]; changed: boolean } {
  const byId = new Map(incoming.map((m) => [m.id, m]));
  let changed = false;
  const merged = current.map((m) => {
    const next = byId.get(m.id);
    if (next && JSON.stringify(next) !== JSON.stringify(m)) {
      changed = true;
      return next;
    }
    return m;
  });
  const currentIds = new Set(current.map((m) => m.id));
  for (const m of incoming) {
    if (!currentIds.has(m.id)) {
      merged.push(m);
      changed = true;
    }
  }
  return { merged, changed };
}
```

`emptyDrinks` 関数の直後に `zeroMember` を追加:

```ts
// 1メンバー分の「全ドリンク0」Member を作る（進行中パーティへの途中追加に使う）。
export function zeroMember(m: { id: string; name: string }): Member {
  return { id: m.id, name: m.name, drinks: emptyDrinks(), megaDrinks: emptyDrinks(), totalDrinks: 0 };
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm run test:unit`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/lib/party.ts src/lib/party.test.ts
git commit -m "feat: rosterOfの空/null区別・mergeMembersの途中参加取り込み・zeroMember追加"
```

---

## Task 3: db.ts に updateGroupMembers を追加（emulator テスト）

**Files:**
- Modify: `src/lib/db.ts`
- Modify: `src/lib/db.test.ts`

> このタスクのテストは emulator が必要（`npm run test:emulators`）。

- [ ] **Step 1: db.test.ts に失敗するテストを追加**

`src/lib/db.test.ts` の db.ts import に `updateGroupMembers` を追加（既存 import ブロック内に1行追加）:

```ts
  updateGroupMembers,
```

party.ts import を1行追加（ファイル冒頭の import 群の最後に）:

```ts
import { zeroMember } from './party';
```

`describe('パーティの保存・取得', ...)` の閉じ `});` の直後に、次の describe を追加:

```ts
describe('名簿（members）の編集', () => {
  it('updateGroupMembers が members 配列を更新する', async () => {
    await signInAs(USER_A);
    await createGroup('g', TEST_MEMBERS, USER_A.uid, USER_A.email, 'ROST01');
    const gid = getActiveGroup()!;
    await updateGroupMembers([...TEST_MEMBERS, { id: 'm_new', name: '新メンバー' }]);
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const snap = await ctx.firestore().collection('groups').doc(gid).get();
      expect(snap.data()?.members).toHaveLength(3);
    });
  });

  it('removed フラグでソフト削除を保存できる', async () => {
    await signInAs(USER_A);
    await createGroup('g', TEST_MEMBERS, USER_A.uid, USER_A.email, 'ROST02');
    const gid = getActiveGroup()!;
    await updateGroupMembers([
      { id: 'm1', name: 'メンバー1', removed: true },
      { id: 'm2', name: 'メンバー2' },
    ]);
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const snap = await ctx.firestore().collection('groups').doc(gid).get();
      const members = snap.data()?.members as Array<{ id: string; removed?: boolean }>;
      expect(members.find((m) => m.id === 'm1')?.removed).toBe(true);
    });
  });

  it('進行中パーティへ updateMemberDrinks で新メンバーを追加できる（カスケード）', async () => {
    await signInAs(USER_A);
    await createGroup('g', TEST_MEMBERS, USER_A.uid, USER_A.email, 'CASC01');
    const gid = getActiveGroup()!;
    const partyId = await createParty({
      areaName: '', storeName: '', startTime: new Date().toISOString(),
      members: [zeroMember({ id: 'm1', name: 'メンバー1' })], totalAmount: 0, splitRoles: {},
    });
    await updateMemberDrinks(partyId, zeroMember({ id: 'm_new', name: '途中参加' }));
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const snap = await ctx.firestore().doc(`groups/${gid}/parties/${partyId}`).get();
      const data = snap.data()!;
      expect(data.members.m1).toBeTruthy();
      expect(data.members.m_new.name).toBe('途中参加');
    });
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm run test:emulators`
Expected: FAIL（`updateGroupMembers` 未定義。なお名簿更新はこの時点ではルール未許可で `assertFails` ではなく実関数なので permission-denied で reject する可能性がある → Task 4 のルール追加とあわせて green になる。まずは「関数が存在しない」ことの確認が主目的）

- [ ] **Step 3: db.ts に updateGroupMembers を実装し、createGroup の引数型を整える**

`src/lib/db.ts` の型 import を次に変更（`GroupMember` を追加）:

```ts
import type { Group, GroupMember, Party, Member } from '../types';
```

`createGroup` の引数型 `members: { id: string; name: string }[]` を次に変更:

```ts
  members: GroupMember[],
```

`saveClaudeApiKey` 関数の直後（パーティ系関数の前あたり）に追加:

```ts
// グループの名簿（members 配列）を丸ごと更新する。removed を含むフル配列を渡すこと。
// parties の members マップとは別物（こちらは配列）。
export async function updateGroupMembers(members: GroupMember[]): Promise<void> {
  if (!activeGroupId) return;
  await updateDoc(doc(db, 'groups', activeGroupId), { members });
}
```

`updateMemberDrinks` の id に関するコメント（`db.ts` 内、`// member.id を Firestore のフィールドパス...` の段落）を次に更新:

```ts
  // member.id は Firestore のフィールドパス（members.<id>）に使うため、安全なセグメントである前提。
  // 固定メンバーは英小文字、動的追加は genMemberId()（m_ + base36）で生成し、いずれも安全。
```

- [ ] **Step 4: テストを実行**

Run: `npm run test:emulators`
Expected: カスケードのテストは PASS。`updateGroupMembers` の2件はルール未許可なら FAIL のまま（Task 4 で green）。少なくとも「関数未定義」エラーは解消していること。

- [ ] **Step 5: コミット**

```bash
git add src/lib/db.ts src/lib/db.test.ts
git commit -m "feat: updateGroupMembersを追加し名簿編集のemulatorテストを用意"
```

---

## Task 4: Firestore ルールで名簿編集を許可（⚠️ 手動デプロイ）

**Files:**
- Modify: `firestore.rules`

- [ ] **Step 1: `firestore.rules` に editsRoster を追加**

`editsSettings` 関数の直後に追加:

```
    // 名簿変更: 既存メンバーが members 配列のみを変更
    function editsRoster(groupId) {
      return isMember(groupId)
        && changedKeys().hasOnly(['members']);
    }
```

`allow update` 行を次に**置換**:

```
      allow update: if isAllowed() && (joinsSelf() || leavesSelf() || editsSettings(groupId) || editsRoster(groupId));
```

- [ ] **Step 2: db.test.ts にルールテストを追加**

Task 3 で追加した `describe('名簿（members）の編集', ...)` の中（最後の `it` の後）に追加:

```ts
  it('ルール: メンバーは members だけの変更を許可される', async () => {
    await signInAs(USER_A);
    const group = await createGroup('g', TEST_MEMBERS, USER_A.uid, USER_A.email, 'ROST03');
    const aCtx = testEnv.authenticatedContext(USER_A.uid, { email: USER_A.email });
    await assertSucceeds(
      aCtx.firestore().collection('groups').doc(group.id).update({
        members: [...TEST_MEMBERS, { id: 'm_x', name: 'X' }],
      }),
    );
  });

  it('ルール: members と他キーの同時変更は拒否される', async () => {
    await signInAs(USER_A);
    const group = await createGroup('g', TEST_MEMBERS, USER_A.uid, USER_A.email, 'ROST04');
    const aCtx = testEnv.authenticatedContext(USER_A.uid, { email: USER_A.email });
    await assertFails(
      aCtx.firestore().collection('groups').doc(group.id).update({
        members: [{ id: 'm1', name: 'x' }],
        name: '別名',
      }),
    );
  });

  it('ルール: 非メンバー（未参加）は members を変更できない', async () => {
    await signInAs(USER_A);
    const group = await createGroup('g', TEST_MEMBERS, USER_A.uid, USER_A.email, 'ROST05');
    const bCtx = testEnv.authenticatedContext(USER_B.uid, { email: USER_B.email });
    await assertFails(
      bCtx.firestore().collection('groups').doc(group.id).update({
        members: [{ id: 'm1', name: 'x' }],
      }),
    );
  });
```

- [ ] **Step 3: テストを実行して成功を確認**

Run: `npm run test:emulators`
Expected: PASS（Task 3 の updateGroupMembers 2件 + ルール3件すべて green。emulator はローカルの firestore.rules を読むので、デプロイ前でもテストは通る）

- [ ] **Step 4: コミット**

```bash
git add firestore.rules src/lib/db.test.ts
git commit -m "feat: Firestoreルールで名簿(members)の編集を許可"
```

- [ ] **Step 5: ⚠️ 本番ルールの手動デプロイをユーザーに依頼**

ルールは `git push` では反映されない。実装完了後、ユーザーに次を案内する（自分では実行しない）:

```
! firebase deploy --only firestore:rules
```

未デプロイのままだと本番で名簿編集が permission-denied で失敗する。

---

## Task 5: useRoster フック（副作用グルー）

**Files:**
- Create: `src/hooks/useRoster.ts`

> 純粋ロジックは Task 1/2 でテスト済み。フックは薄いグルーで、検証は emulator テスト（Task 3/4）と最終の手動確認で行う。

- [ ] **Step 1: useRoster.ts を作成**

`src/hooks/useRoster.ts` を新規作成:

```ts
import { useApp } from '../context/AppContext';
import { updateGroupMembers, updateMemberDrinks } from '../lib/db';
import {
  addMemberToRoster,
  removeFromRoster,
  restoreToRoster,
  renameInRoster,
} from '../lib/roster';
import { findActiveParty, zeroMember } from '../lib/party';
import type { GroupMember } from '../types';

// 名簿操作の副作用（Firestore書込＋context更新＋進行中パーティへのカスケード）を集約するフック。
export function useRoster() {
  const { state, dispatch } = useApp();
  const group = state.groupInfo;

  async function commit(members: GroupMember[]) {
    if (!group) return;
    await updateGroupMembers(members);
    dispatch({ type: 'SET_GROUP', group: { ...group, members } });
  }

  // 名簿に追加し、進行中パーティがあれば0杯でその席も増やす。追加した GroupMember を返す。
  async function addMember(name: string, activePartyId?: string | null): Promise<GroupMember | undefined> {
    if (!group || !name.trim()) return undefined;
    const { members, added } = addMemberToRoster(group.members, name);
    await commit(members);
    const partyId = activePartyId ?? findActiveParty(state.historyData)?._docId ?? null;
    if (partyId) await updateMemberDrinks(partyId, zeroMember(added));
    return added;
  }

  async function removeMember(id: string) {
    if (!group) return;
    await commit(removeFromRoster(group.members, id));
  }

  // 復活。進行中パーティに未参加なら0杯で席を追加（add と同様のカスケード）。
  async function restoreMember(id: string) {
    if (!group) return;
    const target = group.members.find((m) => m.id === id);
    await commit(restoreToRoster(group.members, id));
    const active = findActiveParty(state.historyData);
    if (active && target && !active.members.some((m) => m.id === id)) {
      await updateMemberDrinks(active._docId, zeroMember(target));
    }
  }

  async function renameMember(id: string, name: string) {
    if (!group || !name.trim()) return;
    await commit(renameInRoster(group.members, id, name));
  }

  return { addMember, removeMember, restoreMember, renameMember };
}
```

- [ ] **Step 2: ビルドで型を確認**

Run: `npm run build`
Expected: 型エラーなし（このフックはまだ未使用なので Vite の tree-shake で警告は出ないが、tsc 型チェックを通すこと）

- [ ] **Step 3: コミット**

```bash
git add src/hooks/useRoster.ts
git commit -m "feat: 名簿操作の副作用を集約するuseRosterフックを追加"
```

---

## Task 6: MemberManageView とルーティング

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/views/MemberManageView.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: `AppView` に `memberManage` を追加**

`src/types/index.ts` の `AppView` 行を次に変更:

```ts
export type AppView = 'loading' | 'login' | 'groupSetup' | 'home' | 'party' | 'stats' | 'shareChoice' | 'memberManage';
```

- [ ] **Step 2: MemberManageView を作成**

`src/views/MemberManageView.tsx` を新規作成:

```tsx
import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useRoster } from '../hooks/useRoster';

export function MemberManageView() {
  const { state, dispatch } = useApp();
  const { addMember, removeMember, restoreMember, renameMember } = useRoster();
  const members = state.groupInfo?.members ?? [];
  const active = members.filter((m) => !m.removed);
  const removed = members.filter((m) => m.removed);

  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  async function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    setNewName('');
    await addMember(name);
  }

  async function handleRename(id: string) {
    const name = editName.trim();
    setEditingId(null);
    if (name) await renameMember(id, name);
  }

  function startEdit(id: string, name: string) {
    setEditingId(id);
    setEditName(name);
  }

  return (
    <div className="view">
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
        <button onClick={() => dispatch({ type: 'SET_VIEW', view: 'home' })} className="btn btn-sm">戻る</button>
        <h2 style={{ flex: 1, textAlign: 'center', margin: 0, fontSize: '1.1rem' }}>メンバー管理</h2>
        <div style={{ width: 52 }} />
      </div>

      <div className="glass p-4 mb-4">
        <div className="flex" style={{ gap: '0.5rem' }}>
          <input
            className="input-field"
            style={{ flex: 1, minWidth: 0 }}
            placeholder="名前を入力して追加"
            value={newName}
            maxLength={20}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          />
          <button onClick={handleAdd} className="btn btn-primary">＋追加</button>
        </div>
      </div>

      <div className="sec-divider"><span>メンバー（{active.length}人）</span><div className="sec-line" /></div>
      <div className="flex flex-col gap-2 mb-4">
        {active.length === 0 && (
          <p className="text-muted text-center" style={{ fontSize: '0.85rem' }}>
            メンバーがいません。上の欄から追加してください。
          </p>
        )}
        {active.map((member) => (
          <div key={member.id} className="glass p-3 flex justify-between items-center">
            {editingId === member.id ? (
              <>
                <input
                  className="input-field"
                  style={{ flex: 1, minWidth: 0, marginRight: '0.5rem' }}
                  value={editName}
                  autoFocus
                  maxLength={20}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleRename(member.id); }}
                />
                <button onClick={() => handleRename(member.id)} className="btn btn-sm text-accent" style={{ fontWeight: 'bold' }}>保存</button>
              </>
            ) : (
              <>
                <span style={{ fontWeight: 700 }}>{member.name}</span>
                <div className="flex" style={{ gap: '0.4rem' }}>
                  <button
                    onClick={() => startEdit(member.id, member.name)}
                    className="btn btn-sm btn-ghost text-muted"
                  >
                    改名
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`${member.name} を名簿から外しますか？\n過去の記録は残り、いつでも戻せます。`)) {
                        removeMember(member.id);
                      }
                    }}
                    className="btn btn-sm"
                    style={{ color: 'var(--danger-color)', background: 'transparent', boxShadow: 'none' }}
                  >
                    外す
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {removed.length > 0 && (
        <>
          <div className="sec-divider"><span>以前いたメンバー</span><div className="sec-line" /></div>
          <div className="flex flex-col gap-2">
            {removed.map((member) => (
              <div key={member.id} className="glass p-3 flex justify-between items-center" style={{ opacity: 0.55 }}>
                <span style={{ fontWeight: 700 }}>{member.name}</span>
                <button onClick={() => restoreMember(member.id)} className="btn btn-sm text-accent" style={{ fontWeight: 'bold' }}>戻す</button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: App.tsx にルーティングを追加**

`src/App.tsx` の import に追加:

```ts
import { MemberManageView } from './views/MemberManageView';
```

`switch (state.view)` の `case 'shareChoice':` の行の直後に追加:

```ts
    case 'memberManage': return <MemberManageView />;
```

- [ ] **Step 4: ビルドで確認**

Run: `npm run build`
Expected: 型エラーなし

- [ ] **Step 5: コミット**

```bash
git add src/types/index.ts src/views/MemberManageView.tsx src/App.tsx
git commit -m "feat: メンバー管理画面とルーティングを追加"
```

---

## Task 7: HomeView の導線と空名簿スタートガード

**Files:**
- Modify: `src/views/HomeView.tsx`

- [ ] **Step 1: handleNewParty に空名簿ガードを追加**

`src/views/HomeView.tsx` の import に `rosterOf` は既にあることを確認。`handleNewParty` の中、`const active = findActiveParty(...)` の**前**に追加:

```ts
    if (rosterOf(state.groupInfo).length === 0) {
      alert('まずメンバーを追加してください。');
      dispatch({ type: 'SET_VIEW', view: 'memberManage' });
      return;
    }
```

- [ ] **Step 2: グループ設定カードに「メンバーを編集」ボタンを追加**

招待コードブロック内、`このグループを退出する` ボタンの**直前**（`<button onClick={handleLeaveGroup}` の直前）に追加:

```tsx
          <button
            onClick={() => dispatch({ type: 'SET_VIEW', view: 'memberManage' })}
            className="btn btn-sm mt-3 w-full"
            style={{ fontSize: '0.8rem', fontFamily: 'var(--font-pop)', color: 'var(--accent-color)', background: 'transparent', border: '2px solid var(--accent-color)', boxShadow: 'none' }}
          >
            メンバーを編集
          </button>
```

- [ ] **Step 3: ビルドで確認**

Run: `npm run build`
Expected: 型エラーなし

- [ ] **Step 4: コミット**

```bash
git add src/views/HomeView.tsx
git commit -m "feat: ホームにメンバー編集導線と空名簿スタートガードを追加"
```

---

## Task 8: 新規グループは空名簿で作成し管理画面へ誘導

**Files:**
- Modify: `src/views/GroupSetupView.tsx`

- [ ] **Step 1: createGroup のシードを空にし、作成後に管理画面へ遷移**

`src/views/GroupSetupView.tsx` の import から `FIXED_MEMBERS` を削除（不要になる）:

```ts
// import { FIXED_MEMBERS } from '../constants';  ← この行を削除
```

`handleCreateGroup` 内の `createGroup` 呼び出しを次に変更（第2引数を空配列に）:

```ts
      const group = await createGroup('いつメン', [], user.uid, user.email, code || undefined);
```

同関数内の作成成功後の遷移を次に変更（`alert` の文言更新＋遷移先を memberManage に）:

```ts
      dispatch({ type: 'SET_GROUP', group });
      listenToParties((parties) => dispatch({ type: 'SET_HISTORY', parties }));
      alert(`グループを作成しました！\n\n招待コード: ${group.inviteCode}\n\n続いてメンバーを追加してください。`);
      dispatch({ type: 'SET_VIEW', view: 'memberManage' });
```

- [ ] **Step 2: ビルドで確認**

Run: `npm run build`
Expected: 型エラーなし（`FIXED_MEMBERS` 未使用 import が残っていないこと）

- [ ] **Step 3: コミット**

```bash
git add src/views/GroupSetupView.tsx
git commit -m "feat: 新規グループは空名簿で作成しメンバー管理へ誘導"
```

---

## Task 9: 進行中パーティの「＋メンバーを追加」

**Files:**
- Modify: `src/views/PartyView/MembersTab.tsx`

- [ ] **Step 1: MembersTab に追加 UI と処理を組み込む**

`src/views/PartyView/MembersTab.tsx` の import に追加:

```ts
import { emptyDrinks, zeroMember } from '../../lib/party';
import { useRoster } from '../../hooks/useRoster';
```

（既存の `import { emptyDrinks } from '../../lib/party';` があれば上の行に統合する。）

`MembersTab` 関数の冒頭、`const [megaMode, setMegaMode] = useState(false);` の直後に追加:

```ts
  const { addMember } = useRoster();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');

  async function handleAddMember() {
    const name = newName.trim();
    if (!name) return;
    setNewName('');
    setAdding(false);
    const added = await addMember(name, partyState.id);
    if (added) onUpdate({ ...partyState, members: [...partyState.members, zeroMember(added)] });
  }
```

メンバー一覧（`<div className="flex flex-col gap-3">` ... `</div>`）の**直後**に追加:

```tsx
      <div className="mt-4">
        {adding ? (
          <div className="flex" style={{ gap: '0.5rem' }}>
            <input
              className="input-field"
              style={{ flex: 1, minWidth: 0 }}
              placeholder="名前を入力"
              value={newName}
              autoFocus
              maxLength={20}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddMember(); }}
            />
            <button onClick={handleAddMember} className="btn btn-primary btn-sm">追加</button>
            <button onClick={() => { setAdding(false); setNewName(''); }} className="btn btn-sm btn-ghost text-muted">取消</button>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="btn btn-sm w-full"
            style={{ fontFamily: 'var(--font-pop)', color: 'var(--accent-color)', background: 'transparent', border: '2px dashed var(--border-color)', boxShadow: 'none' }}
          >
            ＋メンバーを追加
          </button>
        )}
      </div>
```

- [ ] **Step 2: ビルドで確認**

Run: `npm run build`
Expected: 型エラーなし（`emptyDrinks` の重複 import が無いこと）

- [ ] **Step 3: コミット**

```bash
git add src/views/PartyView/MembersTab.tsx
git commit -m "feat: 進行中パーティでメンバーをその場追加できるように"
```

---

## Task 10: 最終検証

- [ ] **Step 1: ユニットテスト**

Run: `npm run test:unit`
Expected: 全 PASS

- [ ] **Step 2: emulator テスト**

Run: `npm run test:emulators`
Expected: 全 PASS

- [ ] **Step 3: ビルド**

Run: `npm run build`
Expected: エラーなし

- [ ] **Step 4: 手動確認（`npm run dev`）**

次を確認:
- 既存グループのホーム → 「メンバーを編集」→ 追加/改名/外す/戻す が動く
- メンバーを「外す」と集計（StatsView のメンバー別集計）から消え、「戻す」で再表示される
- 飲み会スタート → 進行中画面の「＋メンバーを追加」でその場に席が増える
- 別アカウントで新規グループ作成 → 空名簿で管理画面に着地 → メンバー追加 → 飲み会スタートできる
- 名簿が空のまま「飲み会スタート」を押すと管理画面へ誘導される

- [ ] **Step 5: 本番 Firestore ルールのデプロイをユーザーに案内**

```
! firebase deploy --only firestore:rules
```

これを実行しないと本番で名簿編集が permission-denied になる。

---

## Self-Review メモ

- **スペック網羅:** 型(removed)=Task1 / rosterOf・mergeMembers=Task2 / updateGroupMembers・カスケード=Task3 / ルール=Task4 / フック=Task5 / 管理画面=Task6 / 導線=Task7 / 新規グループ空名簿=Task8 / 進行中追加=Task9。すべて対応タスクあり。
- **getMemberStats:** スペックの「removed を隠し復活で再表示」は `rosterOf`（=`activeRoster`）のテスト（Task2）で担保。`getMemberStats` は受け取った roster 引数をそのまま尊重するため本体変更不要（YAGNI）。
- **型整合:** `GroupMember`（types）/ `addMemberToRoster` の戻り `{members, added}` / `addMember(name, activePartyId?)` の戻り `GroupMember | undefined` / `zeroMember({id,name})` — 各タスク間で一致。
- **破壊的変更の明示:** `mergeMembers` の「incoming 取り込み」反転に伴い、既存 party.test.ts の該当テストを Task2 で置換済み。
