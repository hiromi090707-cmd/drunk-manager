# グループ退出バグ修正＋隠れ状態（activeGroupId）廃止 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** db.ts の隠れ状態（activeGroupId）を廃止して groupId を明示的に渡す設計にし、グループ退出が実際には退出しないバグと隣接バグ3件を根治する。

**Architecture:** db.ts をステートレス関数群にし、真実の在り処を AppContext の `state.groupInfo` に一本化。履歴リスナーは App.tsx の `useEffect`（キー: groupId）が所有し、onError は「所属失効→groupSetup へ回復」として扱う。スペック: `docs/superpowers/specs/2026-07-02-remove-hidden-group-state-design.md`

**Tech Stack:** React 19 + TypeScript + Vite 8 / Firebase (Auth + Firestore) / Vitest + @firebase/rules-unit-testing（エミュレーター）

## Global Constraints

- Firestore のデータ形状・`firestore.rules` は一切変更しない
- UI 文言・コード内コメントは日本語。新規依存パッケージの追加禁止
- コミットメッセージは `type: 内容` 形式（feat / fix / design / refactor / docs）。各コミットに `-m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"` を付ける
- **Task 1〜6 の間、`npm run build` は赤で正常**（ビュー側が旧シグネチャのため）。エミュレーターテストは各タスク末で green を維持する。build の初 green は Task 7 末
- エミュレーターテストの実行コマンドは常に `npm run test:emulators`（起動込み）。単体は `npm run test:unit`
- push はオーナーの明示的な承認後のみ（push 前に `npm run build` green を確認）

---

### Task 1: db.ts / lib/party.ts のステートレス化（挙動不変）＋既存テストの機械的改修

**Files:**
- Modify: `src/lib/db.ts`（全面書き換え）
- Modify: `src/lib/party.ts:61-72`（createNewParty のみ）
- Test: `src/lib/db.test.ts`（機械的改修）

**Interfaces:**
- Consumes: なし（起点タスク）
- Produces: 以降の全タスクが依存する新シグネチャ:
  - `createGroup(groupName: string, members: GroupMember[], creatorUid: string, creatorEmail: string, customInviteCode?: string): Promise<Group>`
  - `joinGroupByCode(inviteCode: string, uid: string, email: string): Promise<Group>`
  - `findUserGroup(uid: string): Promise<Group | null>`
  - `leaveGroup(groupId: string, uid: string, email: string): Promise<void>`
  - `updateInviteCode(groupId: string, newCode: string): Promise<string>`
  - `updateGroupMembers(groupId: string, members: GroupMember[]): Promise<void>`
  - `createParty(groupId: string, initialData: Partial<Party>): Promise<string>`
  - `deleteParty(groupId: string, partyId: string): Promise<void>`
  - `saveParty(groupId: string, partyData: Party): Promise<void>`
  - `listenToParties(groupId: string, onData: (parties: Party[]) => void, onError?: (error: Error) => void): Unsubscribe`
  - `listenToParty(groupId: string, partyId: string, callback: (party: Party) => void): Unsubscribe`
  - `updateMemberDrinks(groupId: string, partyId: string, member: Member): Promise<void>`
  - `migrateLocalData(groupId: string): Promise<number>`
  - `createNewParty(groupId: string, roster: Roster, rawText?: string): Promise<PartyState>`（lib/party.ts）
  - **削除される export**: `setActiveGroup` / `getActiveGroup` / `cleanup`

- [ ] **Step 1: src/lib/db.ts を以下の内容に全面書き換え**

このタスクでは**挙動は一切変えない**（joinGroupByCode の返り値・findUserGroup の複数ヒット時挙動は旧のまま。Task 2/3 で変更する）。モジュール変数と状態系関数を消し、groupId を引数化するだけ。

```typescript
import {
  collection, doc, addDoc, setDoc, getDoc, getDocs, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, where, serverTimestamp, arrayRemove,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Group, GroupMember, Party, Member } from '../types';
import { membersToMap, membersToArray } from './party';

// groups/<groupId>/parties コレクション参照。groupId は呼び出し元（AppContext の groupInfo）が渡す。
function partiesCollection(groupId: string) {
  return collection(db, 'groups', groupId, 'parties');
}

export async function createGroup(
  groupName: string,
  members: GroupMember[],
  creatorUid: string,
  creatorEmail: string,
  customInviteCode?: string,
): Promise<Group> {
  const inviteCode = customInviteCode || Math.random().toString(36).substring(2, 8).toUpperCase();
  const existing = await getDocs(query(collection(db, 'groups'), where('inviteCode', '==', inviteCode)));
  if (!existing.empty) throw new Error('この招待コードはすでに使われています。別のコードを指定してください。');
  const groupRef = doc(collection(db, 'groups'));
  const groupData = {
    name: groupName,
    memberUids: [creatorUid],
    memberEmails: [creatorEmail],
    members,
    inviteCode,
    createdAt: serverTimestamp(),
    createdBy: creatorUid,
  };
  await setDoc(groupRef, groupData);
  return { id: groupRef.id, ...groupData } as Group;
}

export async function joinGroupByCode(inviteCode: string, uid: string, email: string): Promise<Group> {
  const q = query(collection(db, 'groups'), where('inviteCode', '==', inviteCode));
  const snapshot = await getDocs(q);
  if (snapshot.empty) throw new Error('招待コードが見つかりません');

  const docSnap = snapshot.docs[0];
  const targetGroup = { id: docSnap.id, ...docSnap.data() } as Group;

  if (!targetGroup.memberUids.includes(uid)) {
    await updateDoc(doc(db, 'groups', targetGroup.id), {
      memberUids: [...targetGroup.memberUids, uid],
      memberEmails: [...(targetGroup.memberEmails || []), email],
    });
  }
  return targetGroup;
}

export async function updateInviteCode(groupId: string, newCode: string): Promise<string> {
  const code = newCode.trim().toUpperCase();
  if (code.length < 2 || code.length > 16) {
    throw new Error('招待コードは2〜16文字で入力してください。');
  }
  const existing = await getDocs(query(collection(db, 'groups'), where('inviteCode', '==', code)));
  const takenByOther = existing.docs.some((d) => d.id !== groupId);
  if (takenByOther) throw new Error('この招待コードはすでに使われています。別のコードを指定してください。');
  await updateDoc(doc(db, 'groups', groupId), { inviteCode: code });
  return code;
}

export async function findUserGroup(uid: string): Promise<Group | null> {
  const q = query(collection(db, 'groups'), where('memberUids', 'array-contains', uid));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;

  const docSnap = snapshot.docs[0];
  return { id: docSnap.id, ...docSnap.data() } as Group;
}

export async function leaveGroup(groupId: string, uid: string, email: string): Promise<void> {
  await updateDoc(doc(db, 'groups', groupId), {
    memberUids: arrayRemove(uid),
    memberEmails: arrayRemove(email),
  });
}

// グループの名簿（members 配列）を丸ごと更新する。removed を含むフル配列を渡すこと。
// parties の members マップとは別物（こちらは配列）。
export async function updateGroupMembers(groupId: string, members: GroupMember[]): Promise<void> {
  await updateDoc(doc(db, 'groups', groupId), { members });
}

export async function createParty(groupId: string, initialData: Partial<Party>): Promise<string> {
  const { members, ...rest } = initialData;
  const docRef = await addDoc(partiesCollection(groupId), {
    ...rest,
    ...(members ? { members: membersToMap(members) } : {}),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function deleteParty(groupId: string, partyId: string): Promise<void> {
  await deleteDoc(doc(partiesCollection(groupId), String(partyId)));
}

export async function saveParty(groupId: string, partyData: Party): Promise<void> {
  const partyRef = doc(partiesCollection(groupId), String(partyData.id ?? partyData._docId));
  const { _docId, members, ...rest } = partyData;
  void _docId;
  await setDoc(partyRef, { ...rest, members: membersToMap(members), updatedAt: serverTimestamp() }, { merge: true });
}

// 購読解除は返り値の Unsubscribe を呼び出し元（useEffect の cleanup）が必ず管理する。
// onError は SDK が購読を恒久停止した時のみ発火する（ネットワーク断では発火しない）。
export function listenToParties(
  groupId: string,
  onData: (parties: Party[]) => void,
  onError: (error: Error) => void = console.error,
): Unsubscribe {
  const q = query(partiesCollection(groupId), orderBy('startTime', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const parties: Party[] = [];
    snapshot.forEach((d) => {
      const data = d.data();
      parties.push({ ...data, members: membersToArray(data.members), _docId: d.id } as Party);
    });
    onData(parties);
  }, onError);
}

export function listenToParty(groupId: string, partyId: string, callback: (party: Party) => void): Unsubscribe {
  const partyRef = doc(partiesCollection(groupId), String(partyId));
  return onSnapshot(partyRef, (d) => {
    if (d.exists()) {
      const data = d.data();
      callback({ ...data, members: membersToArray(data.members), _docId: d.id } as Party);
    }
  }, console.error);
}

// 1メンバーのフィールドのみを部分更新する。members.<id> サブツリーだけを書くため、
// 他メンバーの members.<otherId> は Firestore 側で自動マージされ、同時更新が消し合わない。
export async function updateMemberDrinks(groupId: string, partyId: string, member: Member): Promise<void> {
  const ref = doc(db, 'groups', groupId, 'parties', partyId);
  // member.id は Firestore のフィールドパス（members.<id>）に使うため、安全なセグメントである前提。
  // 固定メンバーは英小文字、動的追加は genMemberId()（m_ + base36）で生成し、いずれも安全。
  await updateDoc(ref, {
    [`members.${member.id}`]: member,
    updatedAt: serverTimestamp(),
  });
}

export async function migrateLocalData(groupId: string): Promise<number> {
  const localHistory: Party[] = JSON.parse(localStorage.getItem('drunk_history') || '[]');
  if (localHistory.length === 0) return 0;

  const col = partiesCollection(groupId);
  let migrated = 0;
  for (const party of localHistory) {
    const partyRef = doc(col, String(party.id ?? party._docId));
    const existing = await getDoc(partyRef);
    if (!existing.exists()) {
      const { _docId, ...rest } = party;
      void _docId;
      await setDoc(partyRef, { ...rest, members: membersToMap(membersToArray(party.members)), createdAt: serverTimestamp(), updatedAt: serverTimestamp(), migratedFromLocal: true });
      migrated++;
    }
  }

  if (migrated > 0) {
    localStorage.setItem('drunk_history_backup', localStorage.getItem('drunk_history') ?? '');
    localStorage.removeItem('drunk_history');
  }
  return migrated;
}
```

- [ ] **Step 2: src/lib/party.ts の createNewParty に groupId を追加**

61〜72行目の `createNewParty` を以下に置き換え（他の関数は触らない）:

```typescript
// 新規パーティを Firestore に作成し、対応する PartyState を返す
export async function createNewParty(groupId: string, roster: Roster, rawText = ''): Promise<PartyState> {
  const roles = defaultSplitRoles(roster);
  const members = createInitialMembers(roster);
  const startTime = new Date().toISOString();
  const id = await createParty(groupId, { areaName: '', storeName: '', startTime, members, totalAmount: 0, splitRoles: roles });
  return {
    id, areaName: '', storeName: '', startTime,
    members,
    split: { totalAmount: 0, roles },
    summary: { rawText, result: '' },
  };
}
```

- [ ] **Step 3: src/lib/db.test.ts を新シグネチャに機械的改修**

変更パターン（全箇所に適用）:

1. import 文（19〜32行目）から `cleanup`・`getActiveGroup`・`setActiveGroup` を削除:

```typescript
import {
  createGroup,
  createParty,
  joinGroupByCode,
  leaveGroup,
  listenToParties,
  saveParty,
  updateGroupMembers,
  updateInviteCode,
  updateMemberDrinks,
} from './db';
```

2. `waitForParties` に groupId 引数を追加（70〜88行目）:

```typescript
function waitForParties(
  groupId: string,
  predicate: (parties: Party[]) => boolean,
  timeoutMs = 5000,
): Promise<{ parties: Party[]; unsubscribe: () => void }> {
  return new Promise((resolveP, rejectP) => {
    let unsub: () => void = () => {};
    const timer = setTimeout(() => {
      unsub();
      rejectP(new Error(`waitForParties: タイムアウト (${timeoutMs}ms)`));
    }, timeoutMs);

    unsub = listenToParties(groupId, (parties) => {
      if (predicate(parties)) {
        clearTimeout(timer);
        resolveP({ parties, unsubscribe: unsub });
      }
    });
  });
}
```

3. `afterEach`（118〜136行目）と `afterAll`（138〜142行目）から `cleanup();` の行を削除（リスナーは waitForParties が必ず解除するため不要になった）

4. 各テスト本体の書き換え（機械的置換の一覧）:

| 対象テスト | 変更 |
|---|---|
| `createGroup でグループを作成し activeGroupId が設定される`（145行〜） | テスト名を `createGroup でグループを作成できる` に変更。`expect(getActiveGroup()).toBe(group.id)` の行を削除 |
| `joinGroupByCode で新メンバー本人が…`（161行〜） | `expect(getActiveGroup()).toBe(groupA.id)` の行を削除 |
| `createParty → saveParty → listenToParties…`（218行〜） | `await createGroup(...)` の返り値を `const group =` で受け、`createParty(group.id, {...})`・`saveParty(group.id, party)`・`waitForParties(group.id, ...)` に |
| `updateMemberDrinks は他メンバーのカウントを保持する`（261行〜） | `const gid = getActiveGroup()!` → `const gid = (await createGroup(...)).id`（createGroup の呼び出しと統合）。`createParty(gid, {...})`・`updateMemberDrinks(gid, partyId, mk('m1', 3))` 等に |
| `saveParty は members をマップ形式…`（286行〜） | 同上のパターン（`gid` は createGroup の返り値から） |
| `updateGroupMembers が members 配列を更新する`（308行〜） | `updateGroupMembers(gid, [...])` に |
| `removed フラグでソフト削除…`（319行〜） | 同上 |
| `進行中パーティへ updateMemberDrinks で…`（334行〜） | `createParty(gid, {...})`・`updateMemberDrinks(gid, partyId, zeroMember(...))` に |
| `Aを抜けてBに入った後…`（387行〜） | `saveParty(groupA.id, {...})`・`waitForParties(groupA.id, ...)`・`leaveGroup(groupA.id, USER_A.uid, USER_A.email)`・`expect(getActiveGroup()).toBeNull()` の行は削除・B 側は `saveParty(groupB.id, {...})`・`waitForParties(groupB.id, ...)` に |
| `setActiveGroup で別グループに切り替えた後…`（454行〜） | テスト名を `別グループの listenToParties は新グループのデータのみ流す` に変更。A 側の確認は `waitForParties(groupA.id, ...)`。`setActiveGroup(groupBId); await wait(50);` を削除し、B 側は `waitForParties(groupBId, ...)` で直接購読 |
| `leaveGroup は memberUids と memberEmails の両方から…`（596行〜） | `setActiveGroup(groupId);` を削除し `leaveGroup(groupId, USER_A.uid, USER_A.email)` に |
| `updateInviteCode で既存グループのコードを変更でき…`（658行〜） | `updateInviteCode('new99')` → `updateInviteCode(group.id, 'new99')`（`group` は createGroup の返り値） |
| `他グループが使用中のコードへの変更は reject される`（670行〜） | `await createGroup('A', ...)` の返り値を `const mine =` で受け、`updateInviteCode('TAKEN1')` → `updateInviteCode(mine.id, 'TAKEN1')` に |

- [ ] **Step 4: エミュレーターテストを実行して green を確認**

Run: `npm run test:emulators`
Expected: db.test.ts 全件 PASS（純関数テストも含め全 PASS）。
Note: `npm run build` はビュー側が旧シグネチャのためこの時点では失敗する。想定内（Task 7 まで赤）。

- [ ] **Step 5: Commit**

```bash
git add src/lib/db.ts src/lib/party.ts src/lib/db.test.ts
git commit -m "refactor: db.tsの隠れ状態activeGroupIdを廃止しgroupId引数渡しに統一" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: joinGroupByCode の挙動修正（更新後 Group を返す＋1人1グループ防波堤）

**Files:**
- Modify: `src/lib/db.ts`（joinGroupByCode のみ）
- Test: `src/lib/db.test.ts`

**Interfaces:**
- Consumes: Task 1 の `joinGroupByCode(inviteCode, uid, email)` / `findUserGroup(uid)`
- Produces: `joinGroupByCode` の新挙動: ①返り値の `memberUids`/`memberEmails` に自分が含まれる ②別グループ所属時は `Error('既に別のグループに参加しています。先に退出してください。')` を throw ③対象グループに参加済みならそのまま返す

- [ ] **Step 1: 失敗するテストを db.test.ts の「グループ作成・参加」describe に追加**

```typescript
  it('joinGroupByCode は自分を含めた更新後の Group を返す', async () => {
    await signInAs(USER_A);
    await createGroup('返り値テスト', TEST_MEMBERS, USER_A.uid, USER_A.email, 'RETVAL');

    await signInAs(USER_B);
    const joined = await joinGroupByCode('RETVAL', USER_B.uid, USER_B.email);

    // 更新前のスナップショットではなく、自分を含めた姿が返ること
    expect(joined.memberUids).toContain(USER_B.uid);
    expect(joined.memberEmails).toContain(USER_B.email);
  });

  it('別グループ所属中の joinGroupByCode は拒否される（1人1グループ）', async () => {
    // B が自分のグループを持っている状態を作る
    await signInAs(USER_B);
    await createGroup('Bのグループ', TEST_MEMBERS, USER_B.uid, USER_B.email, 'BHOME1');

    // A のグループも用意
    await signInAs(USER_A);
    await createGroup('Aのグループ', TEST_MEMBERS, USER_A.uid, USER_A.email, 'AHOME1');

    // B が A のグループに参加しようとする
    await signInAs(USER_B);
    await expect(joinGroupByCode('AHOME1', USER_B.uid, USER_B.email)).rejects.toThrow(
      '既に別のグループに参加しています',
    );
  });

  it('参加済みグループへの joinGroupByCode はそのまま Group を返す', async () => {
    await signInAs(USER_A);
    const group = await createGroup('再参加テスト', TEST_MEMBERS, USER_A.uid, USER_A.email, 'REJOIN');

    const again = await joinGroupByCode('REJOIN', USER_A.uid, USER_A.email);
    expect(again.id).toBe(group.id);
    expect(again.memberUids).toContain(USER_A.uid);
  });
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm run test:emulators`
Expected: 追加した3本のうち「更新後の Group を返す」と「別グループ所属中〜拒否」が FAIL（返り値に USER_B が含まれない／throw されない）。「参加済み〜」は PASS でよい。

- [ ] **Step 3: joinGroupByCode を新実装に置き換え**

```typescript
export async function joinGroupByCode(inviteCode: string, uid: string, email: string): Promise<Group> {
  const q = query(collection(db, 'groups'), where('inviteCode', '==', inviteCode));
  const snapshot = await getDocs(q);
  if (snapshot.empty) throw new Error('招待コードが見つかりません');

  const docSnap = snapshot.docs[0];
  const targetGroup = { id: docSnap.id, ...docSnap.data() } as Group;

  // 参加済みならそのまま返す（memberUids に自分が居るので合成不要）
  if (targetGroup.memberUids.includes(uid)) return targetGroup;

  // 1人1グループの不変条件。UI からは通常到達しない防波堤
  const current = await findUserGroup(uid);
  if (current) throw new Error('既に別のグループに参加しています。先に退出してください。');

  const memberUids = [...targetGroup.memberUids, uid];
  const memberEmails = [...(targetGroup.memberEmails || []), email];
  await updateDoc(doc(db, 'groups', targetGroup.id), { memberUids, memberEmails });
  // 更新前のスナップショットではなく、自分を含めた姿をローカル合成して返す（再読取なし）
  return { ...targetGroup, memberUids, memberEmails };
}
```

- [ ] **Step 4: テストを実行して green を確認**

Run: `npm run test:emulators`
Expected: 追加3本を含め全 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/db.ts src/lib/db.test.ts
git commit -m "fix: joinGroupByCodeが更新後のGroupを返すようにし1人1グループを保証" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: findUserGroup の決定化（createdAt 最古を採用）

**Files:**
- Modify: `src/lib/db.ts`（findUserGroup＋ヘルパー追加）
- Test: `src/lib/db.test.ts`

**Interfaces:**
- Consumes: Task 1 の `findUserGroup(uid)`
- Produces: 複数グループ所属時に createdAt 最古の Group を返す決定的挙動（createdAt 欠損は最古扱い）

- [ ] **Step 1: 失敗するテストを追加**

db.test.ts に新しい describe を追加（`findUserGroup` を import に追加すること）:

```typescript
describe('findUserGroup の決定性', () => {
  it('複数グループ所属時は createdAt 最古のグループを返す', async () => {
    // ルール無効化で「A が2つのグループに所属」という異常データを直接作る
    let oldId = '';
    let newId = '';
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const col = ctx.firestore().collection('groups');
      const oldRef = col.doc();
      await oldRef.set({
        name: '古いグループ',
        memberUids: [USER_A.uid],
        memberEmails: [USER_A.email],
        members: TEST_MEMBERS,
        inviteCode: 'OLD111',
        createdBy: USER_A.uid,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });
      oldId = oldRef.id;
      const newRef = col.doc();
      await newRef.set({
        name: '新しいグループ',
        memberUids: [USER_A.uid],
        memberEmails: [USER_A.email],
        members: TEST_MEMBERS,
        inviteCode: 'NEW111',
        createdBy: USER_A.uid,
        createdAt: new Date('2026-06-01T00:00:00Z'),
      });
      newId = newRef.id;
    });

    await signInAs(USER_A);
    const found = await findUserGroup(USER_A.uid);
    expect(found?.id).toBe(oldId);
    void newId;
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm run test:emulators`
Expected: 新テストが FAIL する可能性が高い（Firestore の返却順は不定のため）。もし偶然 PASS した場合も実装は進める（不定順依存を除くのが目的）。

- [ ] **Step 3: findUserGroup を新実装に置き換え**

`firebase/firestore` の import に `Timestamp` を追加した上で:

```typescript
// createdAt を ms に変換。serverTimestamp 未反映や旧データの欠損は最古(0)扱いにして順序を安定させる
function createdAtMillis(createdAt: unknown): number {
  return createdAt instanceof Timestamp ? createdAt.toMillis() : 0;
}

export async function findUserGroup(uid: string): Promise<Group | null> {
  const q = query(collection(db, 'groups'), where('memberUids', 'array-contains', uid));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;

  // 複数グループ所属は想定外だが、返す1件を createdAt 最古で決定的にする
  const groups = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Group);
  groups.sort((a, b) => createdAtMillis(a.createdAt) - createdAtMillis(b.createdAt));
  return groups[0];
}
```

- [ ] **Step 4: テストを実行して green を確認**

Run: `npm run test:emulators`
Expected: 全 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/db.ts src/lib/db.test.ts
git commit -m "fix: findUserGroupが複数グループ所属時にcreatedAt最古を決定的に返すように" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: listenToParties の onError 発火回帰テスト

**Files:**
- Test: `src/lib/db.test.ts`（テストのみ。実装は Task 1 で完了済み）

**Interfaces:**
- Consumes: Task 1 の `listenToParties(groupId, onData, onError)`
- Produces: なし（回帰テストのみ）

- [ ] **Step 1: 回帰テストを追加**

```typescript
describe('リスナーの権限失効', () => {
  it('購読中にメンバーから外されると onError が発火する', async () => {
    await signInAs(USER_A);
    const group = await createGroup('追放テスト', TEST_MEMBERS, USER_A.uid, USER_A.email, 'KICK01');

    // onError を待ち受けてから購読開始
    const errorFired = new Promise<void>((resolveP, rejectP) => {
      const timer = setTimeout(() => rejectP(new Error('onError が10秒以内に発火しなかった')), 10000);
      const unsub = listenToParties(
        group.id,
        () => {},
        () => {
          clearTimeout(timer);
          unsub();
          resolveP();
        },
      );
    });

    // 初回スナップショット到達を待ってから、ルール無効化で A を名簿から外す
    await wait(300);
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('groups').doc(group.id).update({
        memberUids: [],
        memberEmails: [],
      });
    });

    await expect(errorFired).resolves.toBeUndefined();
  }, 15000);
});
```

- [ ] **Step 2: テストを実行して green を確認**

Run: `npm run test:emulators`
Expected: 全 PASS。
**フレーキー時の対応（スペックで合意済み）**: エミュレーターの権限再評価タイミングが不安定で PASS/FAIL が揺れる場合、このテストは**削除**し、Task 8 の手動検証（2端末での退出確認）に切り替える。その場合コミットメッセージに理由を書くこと。

- [ ] **Step 3: Commit**

```bash
git add src/lib/db.test.ts
git commit -m "test: メンバー除外時にlistenToPartiesのonErrorが発火する回帰テストを追加" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: App.tsx のリスナー所有権移動＋GroupSetupView の追随

**Files:**
- Modify: `src/App.tsx`（全面書き換え）
- Modify: `src/views/GroupSetupView.tsx:3,20-24,36-39`

**Interfaces:**
- Consumes: Task 1 の `findUserGroup` / `listenToParties(groupId, onData, onError)` / `migrateLocalData(groupId)`
- Produces: 「履歴リスナーは App.tsx の useEffect（キー: groupId）が所有する」という構造。ビューは `SET_GROUP` を dispatch するだけで購読が始まる/切り替わる/止まる

- [ ] **Step 1: src/App.tsx を以下の内容に全面書き換え**

```tsx
import { useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase';
import { useApp } from './context/AppContext';
import { isUserAllowed } from './lib/auth';
import { findUserGroup, listenToParties, migrateLocalData } from './lib/db';
import { LoadingView } from './views/LoadingView';
import { LoginView } from './views/LoginView';
import { GroupSetupView } from './views/GroupSetupView';
import { HomeView } from './views/HomeView';
import { PartyView } from './views/PartyView';
import { StatsView } from './views/StatsView';
import { ShareChoiceView } from './views/ShareChoiceView';
import { MemberManageView } from './views/MemberManageView';

export function App() {
  const { state, dispatch } = useApp();
  const groupId = state.groupInfo?.id ?? null;

  // 認証状態の監視。責務は「認証確認 → グループ解決 → 画面遷移」のみ（購読はしない）
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        dispatch({ type: 'LOGOUT' });
        return;
      }

      const allowed = await isUserAllowed(user.email ?? '');
      if (!allowed) {
        alert('このアプリの使用が許可されていません。');
        await signOut(auth);
        return;
      }

      try {
        const group = await findUserGroup(user.uid);
        if (group) {
          dispatch({ type: 'SET_GROUP', group });

          const localHistory = JSON.parse(localStorage.getItem('drunk_history') || '[]');
          if (localHistory.length > 0) {
            migrateLocalData(group.id)
              .then((migrated) => {
                if (migrated > 0) alert(`${migrated}件の過去データをクラウドに移行しました！`);
              })
              .catch(console.error);
          }

          dispatch({ type: 'SET_VIEW', view: state.sharedText ? 'shareChoice' : 'home' });
        } else {
          dispatch({ type: 'SET_VIEW', view: 'groupSetup' });
        }
      } catch (err) {
        console.error('グループ情報の取得に失敗:', err);
        dispatch({ type: 'SET_VIEW', view: 'groupSetup' });
      }
    });

    return unsubscribe;
  }, []);

  // 履歴リスナーの唯一の所有者。groupId の変更・null 化（退出/ログアウト/追放）で自動解除される
  useEffect(() => {
    if (!groupId) return;
    return listenToParties(
      groupId,
      (parties) => dispatch({ type: 'SET_HISTORY', parties }),
      (err) => {
        // 購読の恒久停止＝このグループへの所属失効とみなし、グループ選択へ回復する。
        // 意図的な退出中に発火しても handleLeaveGroup と着地点が同じなので冪等
        console.error('履歴リスナーが停止:', err);
        dispatch({ type: 'SET_GROUP', group: null });
        dispatch({ type: 'SET_HISTORY', parties: [] });
        dispatch({ type: 'SET_VIEW', view: 'groupSetup' });
      },
    );
  }, [groupId]);

  switch (state.view) {
    case 'loading':     return <LoadingView />;
    case 'login':       return <LoginView />;
    case 'groupSetup':  return <GroupSetupView />;
    case 'home':        return <HomeView />;
    case 'party':       return <PartyView />;
    case 'stats':       return <StatsView />;
    case 'shareChoice': return <ShareChoiceView />;
    case 'memberManage': return <MemberManageView />;
  }
}
```

- [ ] **Step 2: GroupSetupView から listenToParties を除去**

3行目の import を:

```typescript
import { createGroup, joinGroupByCode } from '../lib/db';
```

`handleCreateGroup` 内（22行目）と `handleJoinGroup` 内（38行目）の
`listenToParties((parties) => dispatch({ type: 'SET_HISTORY', parties }));` の行を**削除**する（`SET_GROUP` dispatch により App.tsx の useEffect が購読を開始するため不要）。

- [ ] **Step 3: 型チェックで App.tsx / GroupSetupView 起因のエラーが消えたことを確認**

Run: `npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -E "App.tsx|GroupSetupView" || echo "App/GroupSetup: エラーなし"`
Expected: `App/GroupSetup: エラーなし`（他ファイルのエラーは Task 6-7 で解消するため残っていてよい）

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/views/GroupSetupView.tsx
git commit -m "refactor: 履歴リスナーの所有権をApp.tsxのuseEffectに移動しonError回復を追加" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: HomeView の退出フロー修正（バグ本丸）

**Files:**
- Modify: `src/views/HomeView.tsx:4,20-32,34-56,58-75,77-81`

**Interfaces:**
- Consumes: Task 1 の `leaveGroup(groupId, uid, email)` / `updateInviteCode(groupId, code)` / `createNewParty(groupId, roster)`。Task 5 の「SET_GROUP null で購読が自動解除される」構造
- Produces: 退出が Firestore に確実に反映される `handleLeaveGroup`

- [ ] **Step 1: import 文を修正（4行目）**

```typescript
import { leaveGroup, updateInviteCode } from '../lib/db';
```

- [ ] **Step 2: handleSaveCode / handleNewParty / handleLeaveGroup / handleLogout を書き換え**

```typescript
  async function handleSaveCode() {
    const group = state.groupInfo;
    if (!group) return;
    setSaving(true);
    try {
      const updated = await updateInviteCode(group.id, codeInput);
      dispatch({ type: 'SET_GROUP', group: { ...group, inviteCode: updated } });
      setEditingCode(false);
      alert(`招待コードを「${updated}」に変更しました。`);
    } catch (e) {
      alert(e instanceof Error ? e.message : '変更に失敗しました。');
    } finally {
      setSaving(false);
    }
  }

  async function handleNewParty() {
    const group = state.groupInfo;
    if (!group) return;
    if (rosterOf(group).length === 0) {
      alert('まずメンバーを追加してください。');
      dispatch({ type: 'SET_VIEW', view: 'memberManage' });
      return;
    }
    const active = findActiveParty(state.historyData);
    if (active) {
      // 進行中の飲み会にそのまま参加（新規作成しない＝乱立防止）
      dispatch({ type: 'SET_PARTY_STATE', party: buildEditPartyState(active) });
      dispatch({ type: 'SET_PARTY_TAB', tab: 'members' });
      dispatch({ type: 'SET_VIEW', view: 'party' });
      return;
    }
    try {
      const newParty = await createNewParty(group.id, rosterOf(group));
      dispatch({ type: 'SET_PARTY_STATE', party: newParty });
      dispatch({ type: 'SET_PARTY_TAB', tab: 'members' });
      dispatch({ type: 'SET_VIEW', view: 'party' });
    } catch {
      alert('飲み会の開始に失敗しました。ネットワーク接続を確認してください。');
    }
  }

  async function handleLeaveGroup() {
    if (!confirm('このグループを退出しますか？\n退出後は招待コードで再参加できます。')) return;
    const user = auth.currentUser;
    const group = state.groupInfo;
    if (!user || !group) return;
    if (!user.email) {
      alert('メールアドレスが取得できませんでした。再ログインしてください。');
      return;
    }
    try {
      // Firestore の退出が成功してから state を破棄する（失敗時は state 無傷でその場に留まる）。
      // groupInfo が null になった時点で App.tsx の useEffect が購読を解除する
      await leaveGroup(group.id, user.uid, user.email);
      dispatch({ type: 'SET_GROUP', group: null });
      dispatch({ type: 'SET_HISTORY', parties: [] });
      dispatch({ type: 'SET_VIEW', view: 'groupSetup' });
    } catch {
      alert('退出に失敗しました。');
    }
  }

  async function handleLogout() {
    if (!confirm('ログアウトしますか？')) return;
    await logout();
  }
```

- [ ] **Step 3: 型チェックで HomeView 起因のエラーが消えたことを確認**

Run: `npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep "HomeView" || echo "HomeView: エラーなし"`
Expected: `HomeView: エラーなし`

- [ ] **Step 4: Commit**

```bash
git add src/views/HomeView.tsx
git commit -m "fix: グループ退出がFirestoreに反映されないバグを修正（成功後にstate破棄）" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: 残り呼び出し元の機械的改修＋build 初 green

**Files:**
- Modify: `src/views/PartyView/index.tsx:3,17-27,36-51`
- Modify: `src/views/PartyView/MembersTab.tsx:6,14,48`
- Modify: `src/views/StatsView/index.tsx:19-34`
- Modify: `src/views/ShareChoiceView.tsx:10-19`
- Modify: `src/hooks/useRoster.ts:17-47`

**Interfaces:**
- Consumes: Task 1 の全新シグネチャ
- Produces: `npm run build` green（プロジェクト全体が新 API に移行完了）

- [ ] **Step 1: PartyView/index.tsx**

`useApp()` の直後（13行目付近）に groupId を取り出す:

```typescript
  const groupId = state.groupInfo?.id ?? null;
```

購読 useEffect（17〜27行目）を:

```typescript
  useEffect(() => {
    if (!partyState.id || !groupId) return;
    listenerRef.current = listenToParty(groupId, partyState.id, (updated) => {
      const current = partyStateRef.current;
      const { merged, changed } = mergeMembers(current.members, updated.members ?? []);
      if (changed) {
        dispatch({ type: 'SET_PARTY_STATE', party: { ...current, members: merged } });
      }
    });
    return () => { listenerRef.current?.(); };
  }, [partyState.id, groupId]);
```

`handleEndParty` 冒頭の saveParty 呼び出し（38行目）を:

```typescript
    if (!groupId) return;
    try {
      await saveParty(groupId, {
```

（`saveParty({` → `saveParty(groupId, {` の変更。`if (!groupId) return;` は `const result = calculateSplit(partyState);` の直後に置く）

- [ ] **Step 2: PartyView/MembersTab.tsx**

`useApp` を import に追加し（7行目付近）:

```typescript
import { useApp } from '../../context/AppContext';
```

コンポーネント冒頭（17行目付近、`useRoster()` の隣）に:

```typescript
  const { state } = useApp();
  const groupId = state.groupInfo?.id ?? null;
```

48行目を:

```typescript
    if (groupId && partyState.id && changed) updateMemberDrinks(groupId, partyState.id, changed).catch(console.error);
```

- [ ] **Step 3: StatsView/index.tsx**

`handleDeleteParty`（31〜34行目）を:

```typescript
  async function handleDeleteParty(party: Party) {
    const groupId = state.groupInfo?.id;
    if (!groupId) return;
    if (!confirm('この飲み会の記録を削除しますか？')) return;
    await deleteParty(groupId, party._docId);
  }
```

（`state` は既に `useApp()` から分割代入されているが `groupInfo` は含まれていないため、21行目の分割代入はそのままにして `state.groupInfo` を使うには、20行目を `const { state, dispatch } = useApp();` のままアクセスする。現状 21 行目が `const { historyData, activeStatsTab, statsDate } = state;` なのでそのまま `state.groupInfo?.id` と書けば良い）

- [ ] **Step 4: ShareChoiceView.tsx**

`handleShareNew`（10〜19行目）を:

```typescript
  async function handleShareNew() {
    const group = state.groupInfo;
    if (!group) return;
    try {
      const newParty = await createNewParty(group.id, rosterOf(group), sharedText);
      dispatch({ type: 'SET_PARTY_STATE', party: newParty });
      dispatch({ type: 'SET_PARTY_TAB', tab: 'summary' });
      dispatch({ type: 'SET_VIEW', view: 'party' });
    } catch {
      alert('飲み会の開始に失敗しました。');
    }
  }
```

- [ ] **Step 5: hooks/useRoster.ts**

`commit`・`addMember`・`restoreMember` の db 呼び出しに `group.id` を渡す:

```typescript
  async function commit(members: GroupMember[]) {
    if (!group) return;
    await updateGroupMembers(group.id, members);
    dispatch({ type: 'SET_GROUP', group: { ...group, members } });
  }

  // 名簿に追加し、進行中パーティがあれば0杯でその席も増やす。追加した GroupMember を返す。
  async function addMember(name: string, activePartyId?: string | null): Promise<GroupMember | undefined> {
    if (!group || !name.trim()) return undefined;
    const { members, added } = addMemberToRoster(group.members, name);
    await commit(members);
    const partyId = activePartyId ?? findActiveParty(state.historyData)?._docId ?? null;
    if (partyId) await updateMemberDrinks(group.id, partyId, zeroMember(added));
    return added;
  }

  // 復活。進行中パーティに未参加なら0杯で席を追加（add と同様のカスケード）。
  async function restoreMember(id: string) {
    if (!group) return;
    const target = group.members.find((m) => m.id === id);
    await commit(restoreToRoster(group.members, id));
    const active = findActiveParty(state.historyData);
    if (active && target && !active.members.some((m) => m.id === id)) {
      await updateMemberDrinks(group.id, active._docId, zeroMember(target));
    }
  }
```

（`removeMember`・`renameMember` は `commit` 経由のため変更不要）

- [ ] **Step 6: build と全テストを実行して green を確認**

Run: `npm run build`
Expected: エラーなしで完走（**プロジェクト初 green**）

Run: `npm run test:unit && npm run test:emulators`
Expected: 全 PASS

- [ ] **Step 7: Commit**

```bash
git add src/views/PartyView/index.tsx src/views/PartyView/MembersTab.tsx src/views/StatsView/index.tsx src/views/ShareChoiceView.tsx src/hooks/useRoster.ts
git commit -m "refactor: 全ビューをgroupId明示渡しの新db APIへ移行" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: CLAUDE.md 更新＋最終検証

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: Task 1〜7 の全変更（ドキュメント化の対象）
- Produces: 実装と一致した CLAUDE.md

- [ ] **Step 1: CLAUDE.md を実装に合わせて更新**

以下の変更を加える:

1. 技術スタック表: 「React 18」→「React 19」。「AI | Anthropic SDK / claude-haiku-4-5-20251001」の行を**削除**
2. 主要ファイルのツリー: `constants.ts` の説明から `CLAUDE_MODEL` を削除。`lib/claude.ts` の行を**削除**。`db.ts` の説明を「Firestoreの全操作（**ステートレス。groupId は全関数の第一引数**）」に変更
3. 「メンバー構成（固定）」セクション: 見出しを「メンバー構成」にし、本文を「初期メンバーは `FIXED_MEMBERS`（グループ未設定時のフォールバック）。**名簿はグループごとに動的管理**（`roster.ts`・`MemberManageView`。追加・改名・ソフト削除に対応）」に書き換え。「メンバー追加・動的化は将来対応予定。」の行を削除
4. 「同時編集（リアルタイム）」セクションに以下の項目を追加:

```markdown
- **db.ts はステートレス**。`activeGroupId` のような隠れ状態は持たない。groupId は全関数の第一引数で、呼び出し元は `state.groupInfo.id` を渡す
- **履歴リスナーの所有者は App.tsx の useEffect（キー: groupId）だけ**。ビューで `listenToParties` を呼ばない。`SET_GROUP` を dispatch すれば購読は自動で開始・切替・解除される
- リスナーの onError は「所属失効」として扱い groupSetup へ回復する。退出は「Firestore 更新成功 → state 破棄」の順（逆にすると退出失敗時に取り残される）
```

5. 「今後の予定」セクション: 「友人追加・グループ共有機能（現状はFIXED_MEMBERSの5人固定）」を「（実装済み: 動的名簿・招待コード参加）」を踏まえて削除し、セクションごと削除してよい

- [ ] **Step 2: 最終検証（3点セット）**

Run: `npm run test:unit`
Expected: 全 PASS

Run: `npm run test:emulators`
Expected: 全 PASS

Run: `npm run build`
Expected: エラーなし

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.mdをステートレスdb設計と現状の実装に合わせて更新" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 4: 手動検証の案内とpush確認（オーナーへ）**

オーナーに以下を報告し、push の承認を得る（承認前に push しない）:

1. 全コミットの一覧（`git log --oneline main...HEAD` 相当の範囲）
2. 手動検証の推奨手順: 本番反映後、2台（または2ブラウザ）でログイン → 片方でグループ退出 → **リロードしても groupSetup 画面のままであること**（旧バグでは元のグループに戻っていた）
3. Task 4 の onError テストを削除した場合はその旨と手動検証での代替を明記
