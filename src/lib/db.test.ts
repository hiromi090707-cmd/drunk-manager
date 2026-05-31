// db.ts の動的テスト。Firebase Emulator が起動している前提で動かす。
// `npm run test:emulators` を使うとエミュレーター起動から自動で実行できる。

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  cleanup,
  createGroup,
  createParty,
  getActiveGroup,
  joinGroupByCode,
  leaveGroup,
  listenToParties,
  saveParty,
  setActiveGroup,
  updateInviteCode,
} from './db';
import { auth } from '../firebase';
import type { Party } from '../types';

const PROJECT_ID = 'drunk-manage';

// テスト用のメンバー定義
const TEST_MEMBERS = [
  { id: 'm1', name: 'メンバー1' },
  { id: 'm2', name: 'メンバー2' },
];

// Auth Emulator は createUserWithEmailAndPassword で uid を指定できないため、
// サインイン後に得られる実 uid で上書きする（オブジェクト自体は mutable に保つ）。
const USER_A = { uid: 'uid-a', email: 'a@example.com' };
const USER_B = { uid: 'uid-b', email: 'b@example.com' };

let testEnv: RulesTestEnvironment;

// 完全なリスナー反映を待つための小さな待機
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * リスナーから「指定の条件を満たすパーティ一覧」を最初に受け取るまで待つ。
 */
function waitForParties(
  predicate: (parties: Party[]) => boolean,
  timeoutMs = 5000,
): Promise<{ parties: Party[]; unsubscribe: () => void }> {
  return new Promise((resolveP, rejectP) => {
    let unsub: () => void = () => {};
    const timer = setTimeout(() => {
      unsub();
      rejectP(new Error(`waitForParties: タイムアウト (${timeoutMs}ms)`));
    }, timeoutMs);

    unsub = listenToParties((parties) => {
      if (predicate(parties)) {
        clearTimeout(timer);
        resolveP({ parties, unsubscribe: unsub });
      }
    });
  });
}

beforeAll(async () => {
  // Auth Emulator にテストユーザーを作成してサインインしておく。
  // Firestore のセキュリティルールが request.auth.token.email を要求するため、
  // db.ts の関数を呼ぶ前にサインイン済みにしておく必要がある。
  // uid は Emulator が採番した実値を USER_A.uid に反映し、以降のテストで使う。
  let cred;
  try {
    cred = await createUserWithEmailAndPassword(auth, USER_A.email, 'password');
  } catch {
    cred = await signInWithEmailAndPassword(auth, USER_A.email, 'password');
  }
  USER_A.uid = cred.user.uid;

  // ルールユニットテスト環境を起動。
  // 環境変数 FIRESTORE_EMULATOR_HOST 等は setup.ts でセット済み。
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'),
      host: 'localhost',
      port: 8080,
    },
  });

  // ルールが要求する config/allowedUsers をセキュリティルールを無効化して書き込む
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const adminDb = ctx.firestore();
    await adminDb
      .collection('config')
      .doc('allowedUsers')
      .set({ emails: [USER_A.email, USER_B.email] });
  });
});

afterEach(async () => {
  // db.ts 側のモジュール状態（activeGroupId・historyUnsubscribe）をリセット
  cleanup();
  // onSnapshot の gRPC stream cancel が完全に伝播するまで一呼吸置く。
  // これがないと clearFirestore の REST 呼び出しと競合して CANCELLED になる。
  await wait(50);
  // Firestore 上のデータも全削除（次のテストへ影響させない）
  await testEnv.clearFirestore();
  // allowedUsers は each で消えるので再投入
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx
      .firestore()
      .collection('config')
      .doc('allowedUsers')
      .set({ emails: [USER_A.email, USER_B.email] });
  });
});

afterAll(async () => {
  cleanup();
  await signOut(auth);
  await testEnv.cleanup();
});

describe('グループ作成・参加', () => {
  it('createGroup でグループを作成し activeGroupId が設定される', async () => {
    const group = await createGroup(
      'テストグループA',
      TEST_MEMBERS,
      USER_A.uid,
      USER_A.email,
      'CODEAA',
    );

    expect(group.id).toBeTruthy();
    expect(group.name).toBe('テストグループA');
    expect(group.memberUids).toContain(USER_A.uid);
    expect(group.inviteCode).toBe('CODEAA');
    expect(getActiveGroup()).toBe(group.id);
  });

  it('joinGroupByCode で別ユーザーが既存グループに参加できる', async () => {
    // Aがグループ作成
    const groupA = await createGroup(
      'テストグループ',
      TEST_MEMBERS,
      USER_A.uid,
      USER_A.email,
      'JOIN01',
    );

    // Bが参加
    const joined = await joinGroupByCode('JOIN01', USER_B.uid, USER_B.email);

    expect(joined.id).toBe(groupA.id);
    expect(getActiveGroup()).toBe(groupA.id);
    // memberUids に B が追加されたことを後から読み直して確認するため、
    // セキュリティルールを無効化して直接 get する
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const snap = await ctx.firestore().collection('groups').doc(groupA.id).get();
      const data = snap.data();
      expect(data?.memberUids).toContain(USER_A.uid);
      expect(data?.memberUids).toContain(USER_B.uid);
    });
  });
});

describe('パーティの保存・取得', () => {
  it('createParty → saveParty → listenToParties でデータが取得できる', async () => {
    await createGroup('保存テスト', TEST_MEMBERS, USER_A.uid, USER_A.email, 'SAVE01');

    // createParty が返す自動生成IDを _docId・id 両方に使い、saveParty と同じドキュメントを指すようにする
    const partyId = await createParty({
      areaName: '渋谷',
      storeName: '居酒屋A',
      startTime: '2026-05-25T18:00:00.000Z',
    });
    expect(partyId).toBeTruthy();

    const party: Party = {
      _docId: partyId,
      id: partyId,
      areaName: '渋谷',
      storeName: '居酒屋A',
      startTime: '2026-05-25T18:00:00.000Z',
      members: TEST_MEMBERS.map((m) => ({
        ...m,
        drinks: { beer: 1, highball: 0, sour: 0, other: 0 },
        totalDrinks: 1,
      })),
      totalAmount: 5000,
      splitRoles: {},
    };
    await saveParty(party);

    const { parties, unsubscribe } = await waitForParties(
      (ps) => ps.some((p) => p.storeName === '居酒屋A' && p.totalAmount === 5000),
    );
    unsubscribe();

    const saved = parties.find((p) => p.storeName === '居酒屋A' && p.totalAmount === 5000)!;
    expect(saved.areaName).toBe('渋谷');
    expect(saved.totalAmount).toBe(5000);
    expect(saved.members.length).toBe(2);
  });
});

describe('グループ切り替え後のリスナー（最重要・再発防止）', () => {
  it('Aを抜けてBに入った後、listenToParties はBのデータだけを受け取る', async () => {
    // === 1. グループAを作成しパーティを保存 ===
    const groupA = await createGroup(
      'グループA',
      TEST_MEMBERS,
      USER_A.uid,
      USER_A.email,
      'GRPA01',
    );

    await saveParty({
      _docId: 'pa-1',
      id: 'pa-1',
      areaName: '渋谷',
      storeName: 'A店',
      startTime: '2026-05-25T18:00:00.000Z',
      members: [],
      totalAmount: 1000,
      splitRoles: {},
    });

    // Aのリスナーが「A店」を受け取ることを一度確認
    {
      const { unsubscribe } = await waitForParties((ps) =>
        ps.some((p) => p.storeName === 'A店'),
      );
      unsubscribe();
    }

    // === 2. グループAから退出（activeGroupId は null になる） ===
    await leaveGroup(USER_A.uid, USER_A.email);
    expect(getActiveGroup()).toBeNull();

    // === 3. グループBを作成 ===
    const groupB = await createGroup(
      'グループB',
      TEST_MEMBERS,
      USER_A.uid,
      USER_A.email,
      'GRPB01',
    );
    expect(getActiveGroup()).toBe(groupB.id);
    expect(groupB.id).not.toBe(groupA.id);

    // === 4. Bにパーティを保存 → 新しい listenToParties はBのデータだけ受け取る ===
    await saveParty({
      _docId: 'pb-1',
      id: 'pb-1',
      areaName: '新宿',
      storeName: 'B店',
      startTime: '2026-05-25T19:00:00.000Z',
      members: [],
      totalAmount: 2000,
      splitRoles: {},
    });

    const { parties, unsubscribe } = await waitForParties((ps) =>
      ps.some((p) => p.storeName === 'B店'),
    );
    unsubscribe();

    // BのリスナーがA店を含んでいたら、グループ切り替え時のリスナー解除が壊れている
    const storeNames = parties.map((p) => p.storeName);
    expect(storeNames).toContain('B店');
    expect(storeNames).not.toContain('A店');
  });

  it('setActiveGroup で別グループに切り替えた後、リスナーは新グループのデータのみ流す', async () => {
    // 直接 setActiveGroup を使うパターン（findUserGroup 経由の切り替えを模擬）
    const groupA = await createGroup('A', TEST_MEMBERS, USER_A.uid, USER_A.email, 'SWAPAA');
    await saveParty({
      _docId: 'a',
      id: 'a',
      areaName: '渋谷',
      storeName: 'A店',
      startTime: '2026-05-25T18:00:00.000Z',
      members: [],
      totalAmount: 100,
      splitRoles: {},
    });

    // 別グループBはセキュリティルール無効化で先に用意する
    let groupBId = '';
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const ref = ctx.firestore().collection('groups').doc();
      await ref.set({
        name: 'B',
        memberUids: [USER_A.uid],
        memberEmails: [USER_A.email],
        members: TEST_MEMBERS,
        inviteCode: 'SWAPBB',
        claudeApiKey: '',
        createdBy: USER_A.uid,
      });
      groupBId = ref.id;
      await ref.collection('parties').doc('b').set({
        id: 'b',
        areaName: '新宿',
        storeName: 'B店',
        startTime: '2026-05-25T19:00:00.000Z',
        members: [],
        totalAmount: 200,
        splitRoles: {},
      });
    });

    // 一旦Aを聴いて反映確認 → リスナー解除
    {
      const { unsubscribe } = await waitForParties((ps) => ps.some((p) => p.storeName === 'A店'));
      unsubscribe();
    }

    // activeGroup を B に切り替えて再リッスン
    setActiveGroup(groupBId);
    await wait(50);
    const { parties, unsubscribe } = await waitForParties((ps) =>
      ps.some((p) => p.storeName === 'B店'),
    );
    unsubscribe();

    const names = parties.map((p) => p.storeName);
    expect(names).toContain('B店');
    expect(names).not.toContain('A店');

    // 後始末で使う変数を参照しておく（lint 用）
    void groupA;
  });
});

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
    await expect(updateInviteCode('TAKEN1')).rejects.toThrow('この招待コードはすでに使われています');
  });
});
