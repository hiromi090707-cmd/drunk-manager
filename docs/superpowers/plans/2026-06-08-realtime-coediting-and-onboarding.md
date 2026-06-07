# リアルタイム同時編集 + 初回オンボーディング Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 飲み会記録を全メンバーがリアルタイムに同時編集できるようにし、初回ログイン時にアプリの使い方を案内するオンボーディングを追加する。

**Architecture:** Firestore 上の party の `members` をマップ `Record<id, Member>` で保存し、各自が自分の押したメンバーのフィールドだけを部分更新することでメンバー間の更新衝突を解消する。マップ⇔配列の変換は `db.ts` の境界に閉じ込め、`Party` 型（アプリ内部表現）は `Member[]` 配列のまま維持するため UI・統計ロジックは無変更。`onSnapshot` のリアルタイム購読で画面リロードなしの即時反映。進行中（endTime 無し）の party を全員で共有して乱立を防ぐ。オンボーディングは `localStorage` フラグで初回のみ表示。

**Tech Stack:** React 18 + TypeScript / Firebase Firestore / vitest（node 環境）/ `@firebase/rules-unit-testing`（emulator）

> **設計との差分（意図的な改善）:** 設計書は「`Party.members` をマップ型へ」としたが、本計画では `Party` 型は `Member[]` のまま維持し、Firestore 保存時のみ `db.ts` 内でマップ化する。これにより変換が単一境界に閉じ込められ、`buildEditPartyState`・`MemberStatsList` 等が無変更で済む。設計の意図（Firestore はマップ／既存履歴の移行不要／部分更新で衝突解消）はそのまま満たす。

---

## File Structure

| ファイル | 責務 | 変更 |
|---------|------|------|
| `src/lib/party.ts` | members の配列⇔マップ変換、進行中 party 判定（純粋関数） | 追加 |
| `src/lib/party.test.ts` | 上記純粋関数のテスト | 新規 |
| `src/lib/db.ts` | Firestore 境界。保存時マップ化／読取時配列化／メンバー部分更新 | 変更 |
| `src/lib/db.test.ts` | 保存テストのマップ対応、部分更新の非破壊テスト | 変更 |
| `src/views/PartyView/MembersTab.tsx` | ドリンクタップ→部分更新呼び出し | 変更 |
| `src/views/PartyView/index.tsx` | 購読マージ（他メンバーのフィールドのみ取り込み） | 変更 |
| `src/views/HomeView.tsx` | 進行中の飲み会に参加する導線 | 変更 |
| `src/lib/onboarding.ts` | 既読フラグの読み書き（storage 注入式） | 新規 |
| `src/lib/onboarding.test.ts` | 既読ロジックのテスト | 新規 |
| `src/components/OnboardingOverlay.tsx` | 初回オンボーディングUI | 新規 |

**テスト実行コマンド（環境別）:**
- 純粋関数（party.test.ts / onboarding.test.ts）: `npx vitest run src/lib/party.test.ts src/lib/onboarding.test.ts`
- Firestore（db.test.ts、emulator 必須）: `npm run test:emulators`
- ビルド: `npm run build`

---

## Task 1: members 配列⇔マップ変換ヘルパー

**Files:**
- Modify: `src/lib/party.ts`（末尾に追加）
- Test: `src/lib/party.test.ts`（新規）

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/party.test.ts`（新規）:

```typescript
import { describe, it, expect } from 'vitest';
import { membersToArray, membersToMap } from './party';
import type { Member } from '../types';

const mkMember = (id: string): Member => ({
  id, name: id.toUpperCase(),
  drinks: { beer: 1, highball: 0, sour: 0, other: 0 },
  megaDrinks: { beer: 0, highball: 0, sour: 0, other: 0 },
  totalDrinks: 1,
});

describe('membersToArray', () => {
  it('マップを配列に変換する', () => {
    const map = { a: mkMember('a'), b: mkMember('b') };
    const arr = membersToArray(map);
    expect(arr.map((m) => m.id).sort()).toEqual(['a', 'b']);
  });

  it('旧形式（配列）はそのまま配列で返す（後方互換）', () => {
    const arr = [mkMember('a'), mkMember('b')];
    expect(membersToArray(arr)).toEqual(arr);
  });

  it('undefined / null は空配列を返す', () => {
    expect(membersToArray(undefined)).toEqual([]);
    expect(membersToArray(null)).toEqual([]);
  });
});

describe('membersToMap', () => {
  it('配列を id キーのマップに変換する', () => {
    const arr = [mkMember('a'), mkMember('b')];
    const map = membersToMap(arr);
    expect(Object.keys(map).sort()).toEqual(['a', 'b']);
    expect(map.a.id).toBe('a');
  });
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `npx vitest run src/lib/party.test.ts`
Expected: FAIL（`membersToArray` / `membersToMap` is not exported）

- [ ] **Step 3: 実装を追加**

`src/lib/party.ts` の末尾に追加:

```typescript
// Firestore から読んだ raw members（マップ / 旧配列 / 欠損）を常に Member[] に正規化する。
// 既存履歴（配列形式）も新形式（マップ）も透過的に扱えるため、データ移行が不要になる。
export function membersToArray(raw: unknown): Member[] {
  if (Array.isArray(raw)) return raw as Member[];
  if (raw && typeof raw === 'object') return Object.values(raw as Record<string, Member>);
  return [];
}

// アプリ内部の Member[] を Firestore 保存用マップ（id キー）に変換する。
// マップ化により members.<id> 単位の部分更新が可能になり、メンバー間の更新衝突を防げる。
export function membersToMap(members: Member[]): Record<string, Member> {
  return Object.fromEntries(members.map((m) => [m.id, m]));
}
```

- [ ] **Step 4: テスト成功を確認**

Run: `npx vitest run src/lib/party.test.ts`
Expected: PASS（5 tests）

- [ ] **Step 5: コミット**

```bash
git add src/lib/party.ts src/lib/party.test.ts
git commit -m "feat: members の配列⇔マップ変換ヘルパーを追加"
```

---

## Task 2: Firestore 保存形式をマップ化（db.ts 境界）

`Party` 型は配列のまま。`db.ts` の読み書き境界でのみマップに変換する。これにより同時編集の部分更新が可能になりつつ、UI・統計は無変更。

**Files:**
- Modify: `src/lib/db.ts`（`createParty` / `saveParty` / `listenToParties` / `listenToParty`）
- Modify: `src/lib/db.test.ts`（パーティ保存テストの検証）

- [ ] **Step 1: db.test.ts の保存テストをマップ対応に修正（失敗させる）**

`src/lib/db.test.ts` の「パーティの保存・取得」テスト内、保存後の検証（現状 `expect(saved.members.length).toBe(2)` 付近）を、配列でもマップでも 2 件あることを確認する形に変更する:

```typescript
// saved.members は listenToParties 経由なら配列に正規化済み。
// 直接 getDoc で見る場合はマップなので、両対応で件数を数える。
const count = Array.isArray(saved.members)
  ? saved.members.length
  : Object.keys(saved.members as object).length;
expect(count).toBe(2);
```

- [ ] **Step 2: Firestore にマップが保存されることを確認するテストを追加（失敗させる）**

同テストファイルの「パーティの保存・取得」describe 内に追加:

```typescript
it('saveParty は members をマップ形式（id キー）で Firestore に保存する', async () => {
  await signInAs(USER_A);
  await createGroup('g', TEST_MEMBERS, USER_A.uid, USER_A.email);
  const gid = getActiveGroup()!;
  const partyId = await createParty({
    areaName: '', storeName: '', startTime: new Date().toISOString(),
    members: [
      { id: 'm1', name: 'メンバー1', drinks: { beer: 2, highball: 0, sour: 0, other: 0 }, megaDrinks: { beer: 0, highball: 0, sour: 0, other: 0 }, totalDrinks: 2 },
    ],
    totalAmount: 0, splitRoles: {},
  });
  // withSecurityRulesDisabled で生データ（マップ）を直接確認
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const snap = await ctx.firestore().doc(`groups/${gid}/parties/${partyId}`).get();
    const data = snap.data()!;
    expect(Array.isArray(data.members)).toBe(false);
    expect(data.members.m1.totalDrinks).toBe(2);
  });
});
```

- [ ] **Step 3: テスト失敗を確認**

Run: `npm run test:emulators`
Expected: 追加テストが FAIL（members が配列で保存されている）

- [ ] **Step 4: db.ts の境界変換を実装**

`src/lib/db.ts`:

(a) import に `membersToMap`, `membersToArray` を追加:

```typescript
import { membersToMap, membersToArray } from './party';
```

(b) `createParty` を members マップ化に変更:

```typescript
export async function createParty(initialData: Partial<Party>): Promise<string> {
  const { members, ...rest } = initialData;
  const docRef = await addDoc(partiesCollection(), {
    ...rest,
    ...(members ? { members: membersToMap(members) } : {}),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}
```

(c) `saveParty` を members マップ化に変更:

```typescript
export async function saveParty(partyData: Party): Promise<void> {
  const partyRef = doc(partiesCollection(), String(partyData.id ?? partyData._docId));
  const { _docId, members, ...rest } = partyData;
  void _docId;
  await setDoc(partyRef, { ...rest, members: membersToMap(members), updatedAt: serverTimestamp() }, { merge: true });
}
```

(d) `listenToParties` のコールバックで members を配列化:

```typescript
historyUnsubscribe = onSnapshot(q, (snapshot) => {
  const parties: Party[] = [];
  snapshot.forEach((d) => {
    const data = d.data();
    parties.push({ ...data, members: membersToArray(data.members), _docId: d.id } as Party);
  });
  callback(parties);
}, console.error);
```

(e) `listenToParty` のコールバックで members を配列化:

```typescript
export function listenToParty(partyId: string, callback: (party: Party) => void): Unsubscribe {
  const partyRef = doc(partiesCollection(), String(partyId));
  return onSnapshot(partyRef, (d) => {
    if (d.exists()) {
      const data = d.data();
      callback({ ...data, members: membersToArray(data.members), _docId: d.id } as Party);
    }
  }, console.error);
}
```

- [ ] **Step 5: テスト成功を確認**

Run: `npm run test:emulators`
Expected: PASS（既存 + 新規。`saved.members` 件数 2、マップ保存テスト緑）

- [ ] **Step 6: ビルド確認**

Run: `npm run build`
Expected: 型エラーなし（`Party.members` は配列のままなので UI/統計は無影響）

- [ ] **Step 7: コミット**

```bash
git add src/lib/db.ts src/lib/db.test.ts
git commit -m "feat: party の members を Firestore にマップ形式で保存（部分更新の土台）"
```

---

## Task 3: ドリンクの部分更新と購読マージ

メンバー単位の部分更新でメンバー間の衝突を解消し、購読マージは「他メンバーのフィールドのみ取り込む」ことで自分の入力中カウントの巻き戻りを防ぐ。

**Files:**
- Modify: `src/lib/db.ts`（`updatePartyMemberDrinks` を `updateMemberDrinks` に置換）
- Modify: `src/lib/db.test.ts`（部分更新の非破壊テスト）
- Modify: `src/views/PartyView/MembersTab.tsx`（呼び出し差し替え）
- Modify: `src/views/PartyView/index.tsx`（購読マージ）

- [ ] **Step 1: 部分更新の非破壊テストを書く（失敗させる）**

`src/lib/db.test.ts` の「パーティの保存・取得」describe 内に追加（import に `updateMemberDrinks` を加える）:

```typescript
it('updateMemberDrinks は他メンバーのカウントを保持する（同時更新の衝突回避）', async () => {
  await signInAs(USER_A);
  await createGroup('g', TEST_MEMBERS, USER_A.uid, USER_A.email);
  const gid = getActiveGroup()!;
  const mk = (id: string, beer: number): Member => ({
    id, name: id, drinks: { beer, highball: 0, sour: 0, other: 0 },
    megaDrinks: { beer: 0, highball: 0, sour: 0, other: 0 }, totalDrinks: beer,
  });
  const partyId = await createParty({
    areaName: '', storeName: '', startTime: new Date().toISOString(),
    members: [mk('m1', 0), mk('m2', 0)], totalAmount: 0, splitRoles: {},
  });

  // m1 と m2 を別々に部分更新
  await updateMemberDrinks(partyId, mk('m1', 3));
  await updateMemberDrinks(partyId, mk('m2', 5));

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const snap = await ctx.firestore().doc(`groups/${gid}/parties/${partyId}`).get();
    const data = snap.data()!;
    expect(data.members.m1.totalDrinks).toBe(3);
    expect(data.members.m2.totalDrinks).toBe(5); // m1 更新で消えていないこと
  });
});
```

`src/lib/db.test.ts` の型 import に `Member` を追加（未追加の場合）:

```typescript
import type { Member, Party } from '../types';
```

- [ ] **Step 2: テスト失敗を確認**

Run: `npm run test:emulators`
Expected: FAIL（`updateMemberDrinks` is not exported）

- [ ] **Step 3: db.ts に `updateMemberDrinks` を実装し、旧関数を削除**

`src/lib/db.ts` の `updatePartyMemberDrinks` を以下に置換:

```typescript
// 1メンバーのフィールドのみを部分更新する。members.<id> サブツリーだけを書くため、
// 他メンバーの members.<otherId> は Firestore 側で自動マージされ、同時更新が消し合わない。
export async function updateMemberDrinks(partyId: string, member: Member): Promise<void> {
  if (!activeGroupId) return;
  const ref = doc(db, 'groups', activeGroupId, 'parties', partyId);
  await updateDoc(ref, {
    [`members.${member.id}`]: member,
    updatedAt: serverTimestamp(),
  });
}
```

`Member` 型の import を db.ts に追加（既に `import type { Group, Party, Member } from '../types';` なので確認のみ）。

- [ ] **Step 4: テスト成功を確認**

Run: `npm run test:emulators`
Expected: PASS（非破壊テスト緑）

- [ ] **Step 5: MembersTab を部分更新呼び出しに差し替え**

`src/views/PartyView/MembersTab.tsx`:

import を変更:

```typescript
import { updateMemberDrinks } from '../../lib/db';
```

`updateDrink` 内の保存呼び出しを、更新した1メンバーだけを送る形に変更:

```typescript
function updateDrink(mId: string, type: string, delta: 1 | -1, target: 'regular' | 'mega') {
  let changed: Member | undefined;
  const members = partyState.members.map((m): Member => {
    if (m.id !== mId) return m;
    if (target === 'mega') {
      const current = m.megaDrinks ?? emptyDrinks();
      const count = Math.max(0, (current[type as keyof Member['drinks']] || 0) + delta);
      changed = { ...m, megaDrinks: { ...current, [type]: count } };
      return changed;
    }
    const count = Math.max(0, (m.drinks[type as keyof Member['drinks']] || 0) + delta);
    const prev = m.drinks[type as keyof Member['drinks']] || 0;
    const diff = count - prev;
    changed = { ...m, drinks: { ...m.drinks, [type]: count }, totalDrinks: m.totalDrinks + diff };
    return changed;
  });
  const updated = { ...partyState, members };
  onUpdate(updated);
  if (partyState.id && changed) updateMemberDrinks(partyState.id, changed).catch(console.error);
}
```

- [ ] **Step 6: PartyView の購読マージを「他メンバーのフィールドのみ」に厳密化**

`src/views/PartyView/index.tsx` の `useEffect` 内 `listenToParty` コールバックを変更:

```typescript
listenerRef.current = listenToParty(partyState.id, (updated) => {
  const current = partyStateRef.current;
  // サーバー由来の members（配列）を、現在のローカル members にメンバー単位でマージする。
  // 自分が入力中のメンバーを巻き戻さないよう、各メンバーは「変化があった場合のみ」差し替える。
  const incoming = updated.members ?? [];
  const byId = new Map(incoming.map((m) => [m.id, m]));
  let changedAny = false;
  const merged = current.members.map((m) => {
    const next = byId.get(m.id);
    if (next && JSON.stringify(next) !== JSON.stringify(m)) {
      changedAny = true;
      return next;
    }
    return m;
  });
  if (changedAny) {
    dispatch({ type: 'SET_PARTY_STATE', party: { ...current, members: merged } });
  }
});
```

- [ ] **Step 7: ビルド確認**

Run: `npm run build`
Expected: 型エラーなし

- [ ] **Step 8: コミット**

```bash
git add src/lib/db.ts src/lib/db.test.ts src/views/PartyView/MembersTab.tsx src/views/PartyView/index.tsx
git commit -m "feat: ドリンクをメンバー単位で部分更新し同時編集の衝突を解消"
```

---

## Task 4: 進行中の飲み会の共有

endTime 無しの party を「進行中」とみなし、誰かが開始済みなら新規作成せずそれに参加する。

**Files:**
- Modify: `src/lib/party.ts`（`findActiveParty` 追加）
- Modify: `src/lib/party.test.ts`（テスト追加）
- Modify: `src/views/HomeView.tsx`（参加導線）

- [ ] **Step 1: 進行中検出のテストを書く（失敗させる）**

`src/lib/party.test.ts` に追加:

```typescript
import { findActiveParty } from './party';
import type { Party } from '../types';

describe('findActiveParty', () => {
  const party = (id: string, endTime?: string): Party => ({
    _docId: id, areaName: '', storeName: '', startTime: '2026-06-08T10:00:00Z',
    endTime, members: [], totalAmount: 0, splitRoles: {},
  });

  it('endTime 無しの party を進行中として返す', () => {
    const history = [party('a', '2026-06-08T12:00:00Z'), party('b')];
    expect(findActiveParty(history)?._docId).toBe('b');
  });

  it('全て終了済みなら null', () => {
    const history = [party('a', '2026-06-08T12:00:00Z')];
    expect(findActiveParty(history)).toBeNull();
  });

  it('空配列なら null', () => {
    expect(findActiveParty([])).toBeNull();
  });
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `npx vitest run src/lib/party.test.ts`
Expected: FAIL（`findActiveParty` is not exported）

- [ ] **Step 3: `findActiveParty` を実装**

`src/lib/party.ts` の末尾に追加:

```typescript
// 進行中（endTime を持たない）の party を1件返す。history は startTime 降順前提なので
// 先頭にヒットした最新の進行中を返す。無ければ null。
export function findActiveParty(history: Party[]): Party | null {
  return history.find((p) => !p.endTime) ?? null;
}
```

- [ ] **Step 4: テスト成功を確認**

Run: `npx vitest run src/lib/party.test.ts`
Expected: PASS

- [ ] **Step 5: HomeView に参加導線を実装**

`src/views/HomeView.tsx`:

import を追加:

```typescript
import { createNewParty, rosterOf } from '../lib/party';
import { findActiveParty, buildEditPartyState } from '../lib/party';
```

（既存の `createNewParty, rosterOf` の import 行に `findActiveParty, buildEditPartyState` を足す形でよい。）

`handleNewParty` を、進行中があれば参加・無ければ新規に変更:

```typescript
async function handleNewParty() {
  const active = findActiveParty(state.historyData);
  if (active) {
    // 進行中の飲み会にそのまま参加（新規作成しない＝乱立防止）
    dispatch({ type: 'SET_PARTY_STATE', party: buildEditPartyState(active) });
    dispatch({ type: 'SET_PARTY_TAB', tab: 'members' });
    dispatch({ type: 'SET_VIEW', view: 'party' });
    return;
  }
  try {
    const newParty = await createNewParty(rosterOf(state.groupInfo));
    dispatch({ type: 'SET_PARTY_STATE', party: newParty });
    dispatch({ type: 'SET_PARTY_TAB', tab: 'members' });
    dispatch({ type: 'SET_VIEW', view: 'party' });
  } catch {
    alert('飲み会の開始に失敗しました。ネットワーク接続を確認してください。');
  }
}
```

「飲み会スタート」ボタンのラベルとサブテキストを、進行中の有無で出し分け。`return (` の直前で算出:

```typescript
const activeParty = findActiveParty(state.historyData);
```

ボタン部分（既存の `🍺 飲み会スタート` ブロック）を置換:

```tsx
<button
  onClick={handleNewParty}
  className="btn btn-primary w-full p-4"
  style={{ fontSize: '1.25rem', marginBottom: '0.75rem', boxShadow: '0 4px 15px rgba(99, 102, 241, 0.4)' }}
>
  {activeParty ? '🍺 進行中の飲み会に参加' : '🍺 飲み会スタート'}
</button>
<p className="text-muted" style={{ fontSize: '0.8rem' }}>
  {activeParty ? 'みんなが編集中の飲み会にそのまま合流します' : 'いつものメンバーで新しい記録を始めます'}
</p>
```

- [ ] **Step 6: ビルド確認**

Run: `npm run build`
Expected: 型エラーなし

- [ ] **Step 7: コミット**

```bash
git add src/lib/party.ts src/lib/party.test.ts src/views/HomeView.tsx
git commit -m "feat: 進行中の飲み会に合流できるようにし party の乱立を防ぐ"
```

---

## Task 5: 初回オンボーディング

localStorage の既読フラグ（storage 注入式でテスト可能）と、ホームに重ねる説明オーバーレイ。

**Files:**
- Create: `src/lib/onboarding.ts`
- Create: `src/lib/onboarding.test.ts`
- Create: `src/components/OnboardingOverlay.tsx`
- Modify: `src/views/HomeView.tsx`（オーバーレイ表示）

- [ ] **Step 1: 既読ロジックのテストを書く（失敗させる）**

`src/lib/onboarding.test.ts`（新規）:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { hasSeenOnboarding, markOnboardingSeen } from './onboarding';

describe('onboarding 既読フラグ', () => {
  it('フラグ未設定なら未読（false）', () => {
    const storage = { getItem: () => null } as unknown as Storage;
    expect(hasSeenOnboarding(storage)).toBe(false);
  });

  it('フラグが立っていれば既読（true）', () => {
    const storage = { getItem: () => '1' } as unknown as Storage;
    expect(hasSeenOnboarding(storage)).toBe(true);
  });

  it('markOnboardingSeen で既読キーを保存する', () => {
    const setItem = vi.fn();
    const storage = { setItem } as unknown as Storage;
    markOnboardingSeen(storage);
    expect(setItem).toHaveBeenCalledWith('drunk_onboarding_seen', '1');
  });
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `npx vitest run src/lib/onboarding.test.ts`
Expected: FAIL（モジュール無し）

- [ ] **Step 3: onboarding.ts を実装**

`src/lib/onboarding.ts`（新規）:

```typescript
// 初回オンボーディングの既読状態を localStorage で管理する。
// storage を引数で注入可能にして node 環境のテストでもモックできるようにする。
const ONBOARDING_KEY = 'drunk_onboarding_seen';

export function hasSeenOnboarding(storage: Pick<Storage, 'getItem'> = localStorage): boolean {
  return storage.getItem(ONBOARDING_KEY) === '1';
}

export function markOnboardingSeen(storage: Pick<Storage, 'setItem'> = localStorage): void {
  storage.setItem(ONBOARDING_KEY, '1');
}
```

- [ ] **Step 4: テスト成功を確認**

Run: `npx vitest run src/lib/onboarding.test.ts`
Expected: PASS（3 tests）

- [ ] **Step 5: OnboardingOverlay コンポーネントを作成**

`src/components/OnboardingOverlay.tsx`（新規）。居酒屋アンバーのテーマに合わせた全画面オーバーレイ。スライドを「次へ」で進め、最終ページ or スキップで `onClose` を呼ぶ:

```tsx
import { useState } from 'react';

const SLIDES = [
  { emoji: '🍺', title: 'ようこそ Drunk へ', body: '友人みんなで飲み会のドリンクを記録・割り勘・要約できるアプリです。' },
  { emoji: '👆', title: 'タップで記録', body: 'メンバーの飲み物をタップで＋1、長押しで－1。「メガ入力」でメガジョッキも数えられます。' },
  { emoji: '⚡', title: 'みんなで同時に', body: '誰かが飲み会を始めると全員が同じ記録をリアルタイムに編集できます。各自が自分の杯数をその場で入力できます。' },
  { emoji: '💰', title: '割り勘と要約', body: '傾斜配分の割り勘、AIによる飲み会の要約、過去の集計もまとめて確認できます。' },
];

export function OnboardingOverlay({ onClose }: { onClose: () => void }) {
  const [page, setPage] = useState(0);
  const isLast = page === SLIDES.length - 1;
  const slide = SLIDES[page];

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(18, 12, 8, 0.92)', backdropFilter: 'blur(4px)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '2rem', textAlign: 'center',
      }}
    >
      <div className="glass p-4" style={{ maxWidth: 360, width: '100%' }}>
        <div style={{ fontSize: '3.5rem', marginBottom: '0.5rem' }}>{slide.emoji}</div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', marginBottom: '0.75rem', color: 'var(--accent-color)' }}>
          {slide.title}
        </h2>
        <p className="text-muted" style={{ fontSize: '0.95rem', lineHeight: 1.7, minHeight: '5.5rem' }}>
          {slide.body}
        </p>

        <div className="flex justify-center" style={{ gap: '0.4rem', margin: '1rem 0' }}>
          {SLIDES.map((_, i) => (
            <span key={i} style={{
              width: 8, height: 8, borderRadius: '50%',
              background: i === page ? 'var(--accent-color)' : 'var(--border-color)',
            }} />
          ))}
        </div>

        <button
          onClick={() => (isLast ? onClose() : setPage((p) => p + 1))}
          className="btn btn-primary w-full p-3"
          style={{ fontSize: '1.05rem', fontWeight: 700 }}
        >
          {isLast ? 'はじめる' : '次へ'}
        </button>
        {!isLast && (
          <button onClick={onClose} className="btn btn-sm btn-ghost text-muted w-full" style={{ marginTop: '0.5rem' }}>
            スキップ
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: HomeView にオーバーレイを組み込む**

`src/views/HomeView.tsx`:

import を追加:

```typescript
import { OnboardingOverlay } from '../components/OnboardingOverlay';
import { hasSeenOnboarding, markOnboardingSeen } from '../lib/onboarding';
```

state を追加（既存の useState 群の近く）:

```typescript
const [showOnboarding, setShowOnboarding] = useState(() => !hasSeenOnboarding());
```

閉じるハンドラを追加:

```typescript
function handleCloseOnboarding() {
  markOnboardingSeen();
  setShowOnboarding(false);
}
```

`return (` の最上位 `<div className="view" id="view-home">` の直後（先頭の子）にオーバーレイを差し込む:

```tsx
{showOnboarding && <OnboardingOverlay onClose={handleCloseOnboarding} />}
```

- [ ] **Step 7: テスト・ビルド確認**

Run: `npx vitest run src/lib/onboarding.test.ts`
Expected: PASS

Run: `npm run build`
Expected: 型エラーなし

- [ ] **Step 8: コミット**

```bash
git add src/lib/onboarding.ts src/lib/onboarding.test.ts src/components/OnboardingOverlay.tsx src/views/HomeView.tsx
git commit -m "feat: 初回ログイン時のオンボーディング画面を追加"
```

---

## Task 6: 全体検証

- [ ] **Step 1: 全テスト（emulator 込み）**

Run: `npm run test:emulators`
Expected: 全テスト PASS（party.test.ts / onboarding.test.ts / db.test.ts / alcohol.test.ts）

- [ ] **Step 2: ビルド**

Run: `npm run build`
Expected: エラーなし

- [ ] **Step 3: 手動確認の観点（ユーザー向けメモ）**

- 2端末で同じグループにログイン → 一方で「飲み会スタート」、他方のホームに「進行中の飲み会に参加」が出る
- 双方でドリンクをタップ → 互いの画面にリロードなしで即時反映、かつ互いのカウントが消えない
- 「保存」で履歴化 → 統計・履歴が従来通り表示される
- 既存の過去履歴（配列形式）が壊れず表示される（後方互換）
- 新規ログイン端末で初回のみオンボーディング表示、2回目以降は非表示

---

## Self-Review（writing-plans）

**Spec coverage:**
- マップ化＋部分更新で衝突解消 → Task 2, 3 ✅
- 後方互換（移行不要） → Task 1 `membersToArray` + Task 2 listen 変換 ✅
- 即時反映（onSnapshot 維持＋マージ厳密化） → Task 3 Step 6 ✅
- 進行中共有・乱立防止 → Task 4 ✅
- Firestore ルール変更不要 → 計画でルール改変なし（権限モデル「全員編集可」のまま）✅
- オンボーディング初回のみ → Task 5 ✅
- テスト（正規化・部分更新非破壊・進行中検出・既読分岐） → Task 1/2/3/4/5 ✅

**型整合:** `membersToArray`/`membersToMap`/`updateMemberDrinks`/`findActiveParty` は全タスクで同名・同シグネチャ。`Party.members` は配列のまま一貫。

**Placeholder scan:** TODO/TBD なし。各コード step に実コードあり。
