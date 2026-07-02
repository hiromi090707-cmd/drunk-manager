// db.ts の動的テスト。Firebase Emulator が起動している前提で動かす。
// `npm run test:emulators` を使うとエミュレーター起動から自動で実行できる。

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
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
import { zeroMember } from './party';
import { auth } from '../firebase';
import type { Member, Party } from '../types';

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

let testEnv: RulesTestEnvironment;

// 完全なリスナー反映を待つための小さな待機
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * リスナーから「指定の条件を満たすパーティ一覧」を最初に受け取るまで待つ。
 */
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

beforeAll(async () => {
  // USER_A / USER_B 両方を Auth Emulator に用意し、実 uid を確定。
  // 既定の認証主体は USER_A に戻しておく。
  await signInAs(USER_A);
  await signInAs(USER_B);
  await signInAs(USER_A);

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
  // テスト内で USER_B に切り替えていても、次テストは USER_A 前提に戻す
  await signInAs(USER_A);
});

afterAll(async () => {
  await signOut(auth);
  await testEnv.cleanup();
});

describe('グループ作成・参加', () => {
  it('createGroup でグループを作成できる', async () => {
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
  });

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

    // memberUids/memberEmails に B が追加されたことをルール無効化で直接確認
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const snap = await ctx.firestore().collection('groups').doc(groupA.id).get();
      const data = snap.data();
      expect(data?.memberUids).toContain(USER_A.uid);
      expect(data?.memberUids).toContain(USER_B.uid);
      expect(data?.memberEmails).toContain(USER_B.email);
    });
  });

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
});

describe('パーティの保存・取得', () => {
  it('createParty → saveParty → listenToParties でデータが取得できる', async () => {
    const group = await createGroup('保存テスト', TEST_MEMBERS, USER_A.uid, USER_A.email, 'SAVE01');

    // createParty が返す自動生成IDを _docId・id 両方に使い、saveParty と同じドキュメントを指すようにする
    const partyId = await createParty(group.id, {
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
    await saveParty(group.id, party);

    const { parties, unsubscribe } = await waitForParties(
      group.id,
      (ps) => ps.some((p) => p.storeName === '居酒屋A' && p.totalAmount === 5000),
    );
    unsubscribe();

    const saved = parties.find((p) => p.storeName === '居酒屋A' && p.totalAmount === 5000)!;
    expect(saved.areaName).toBe('渋谷');
    expect(saved.totalAmount).toBe(5000);
    // saved.members は listenToParties 経由なら配列に正規化済み。
    // 直接 getDoc で見る場合はマップなので、両対応で件数を数える。
    const count = Array.isArray(saved.members)
      ? saved.members.length
      : Object.keys(saved.members as object).length;
    expect(count).toBe(2);
  });

  it('updateMemberDrinks は他メンバーのカウントを保持する（同時更新の衝突回避）', async () => {
    await signInAs(USER_A);
    const gid = (await createGroup('g', TEST_MEMBERS, USER_A.uid, USER_A.email)).id;
    const mk = (id: string, beer: number): Member => ({
      id, name: id, drinks: { beer, highball: 0, sour: 0, other: 0 },
      megaDrinks: { beer: 0, highball: 0, sour: 0, other: 0 }, totalDrinks: beer,
    });
    const partyId = await createParty(gid, {
      areaName: '', storeName: '', startTime: new Date().toISOString(),
      members: [mk('m1', 0), mk('m2', 0)], totalAmount: 0, splitRoles: {},
    });

    // m1 と m2 を別々に部分更新
    await updateMemberDrinks(gid, partyId, mk('m1', 3));
    await updateMemberDrinks(gid, partyId, mk('m2', 5));

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const snap = await ctx.firestore().doc(`groups/${gid}/parties/${partyId}`).get();
      const data = snap.data()!;
      expect(data.members.m1.totalDrinks).toBe(3);
      expect(data.members.m2.totalDrinks).toBe(5); // m1 更新で消えていないこと
    });
  });

  it('saveParty は members をマップ形式（id キー）で Firestore に保存する', async () => {
    await signInAs(USER_A);
    const gid = (await createGroup('g', TEST_MEMBERS, USER_A.uid, USER_A.email, 'MAP001')).id;
    const partyId = await createParty(gid, {
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
});

describe('名簿（members）の編集', () => {
  it('updateGroupMembers が members 配列を更新する', async () => {
    await signInAs(USER_A);
    const gid = (await createGroup('g', TEST_MEMBERS, USER_A.uid, USER_A.email, 'ROST01')).id;
    await updateGroupMembers(gid, [...TEST_MEMBERS, { id: 'm_new', name: '新メンバー' }]);
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const snap = await ctx.firestore().collection('groups').doc(gid).get();
      expect(snap.data()?.members).toHaveLength(3);
    });
  });

  it('removed フラグでソフト削除を保存できる', async () => {
    await signInAs(USER_A);
    const gid = (await createGroup('g', TEST_MEMBERS, USER_A.uid, USER_A.email, 'ROST02')).id;
    await updateGroupMembers(gid, [
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
    const gid = (await createGroup('g', TEST_MEMBERS, USER_A.uid, USER_A.email, 'CASC01')).id;
    const partyId = await createParty(gid, {
      areaName: '', storeName: '', startTime: new Date().toISOString(),
      members: [zeroMember({ id: 'm1', name: 'メンバー1' })], totalAmount: 0, splitRoles: {},
    });
    await updateMemberDrinks(gid, partyId, zeroMember({ id: 'm_new', name: '途中参加' }));
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const snap = await ctx.firestore().doc(`groups/${gid}/parties/${partyId}`).get();
      const data = snap.data()!;
      expect(data.members.m1).toBeTruthy();
      expect(data.members.m_new.name).toBe('途中参加');
    });
  });

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

    await saveParty(groupA.id, {
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
      const { unsubscribe } = await waitForParties(groupA.id, (ps) =>
        ps.some((p) => p.storeName === 'A店'),
      );
      unsubscribe();
    }

    // === 2. グループAから退出 ===
    await leaveGroup(groupA.id, USER_A.uid, USER_A.email);

    // === 3. グループBを作成 ===
    const groupB = await createGroup(
      'グループB',
      TEST_MEMBERS,
      USER_A.uid,
      USER_A.email,
      'GRPB01',
    );
    expect(groupB.id).not.toBe(groupA.id);

    // === 4. Bにパーティを保存 → 新しい listenToParties はBのデータだけ受け取る ===
    await saveParty(groupB.id, {
      _docId: 'pb-1',
      id: 'pb-1',
      areaName: '新宿',
      storeName: 'B店',
      startTime: '2026-05-25T19:00:00.000Z',
      members: [],
      totalAmount: 2000,
      splitRoles: {},
    });

    const { parties, unsubscribe } = await waitForParties(groupB.id, (ps) =>
      ps.some((p) => p.storeName === 'B店'),
    );
    unsubscribe();

    // BのリスナーがA店を含んでいたら、グループ切り替え時のリスナー解除が壊れている
    const storeNames = parties.map((p) => p.storeName);
    expect(storeNames).toContain('B店');
    expect(storeNames).not.toContain('A店');
  });

  it('別グループの listenToParties は新グループのデータのみ流す', async () => {
    const groupA = await createGroup('A', TEST_MEMBERS, USER_A.uid, USER_A.email, 'SWAPAA');
    await saveParty(groupA.id, {
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
      const { unsubscribe } = await waitForParties(groupA.id, (ps) => ps.some((p) => p.storeName === 'A店'));
      unsubscribe();
    }

    // B を直接 waitForParties で購読
    const { parties, unsubscribe } = await waitForParties(groupBId, (ps) =>
      ps.some((p) => p.storeName === 'B店'),
    );
    unsubscribe();

    const names = parties.map((p) => p.storeName);
    expect(names).toContain('B店');
    expect(names).not.toContain('A店');
  });
});

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
        createdBy: USER_A.uid,
      }),
    );
  });

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
        createdBy: USER_A.uid,
      });
      groupId = ref.id;
    });

    await signInAs(USER_A);
    await leaveGroup(groupId, USER_A.uid, USER_A.email);

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const snap = await ctx.firestore().collection('groups').doc(groupId).get();
      const data = snap.data();
      expect(data?.memberUids).not.toContain(USER_A.uid);
      expect(data?.memberEmails).not.toContain(USER_A.email);
      expect(data?.memberUids).toContain(USER_B.uid);
    });
  });

  it('メンバーでも claudeApiKey は変更できない（AI撤去後）', async () => {
    await signInAs(USER_A);
    const group = await createGroup('G', TEST_MEMBERS, USER_A.uid, USER_A.email, 'APIK01');

    const aCtx = testEnv.authenticatedContext(USER_A.uid, { email: USER_A.email });
    await assertFails(
      aCtx.firestore().collection('groups').doc(group.id).update({ claudeApiKey: 'sk-test' }),
    );
  });

  it('メンバーは inviteCode のみの変更ができる', async () => {
    await signInAs(USER_A);
    const group = await createGroup('G', TEST_MEMBERS, USER_A.uid, USER_A.email, 'APIK02');

    const aCtx = testEnv.authenticatedContext(USER_A.uid, { email: USER_A.email });
    await assertSucceeds(
      aCtx.firestore().collection('groups').doc(group.id).update({ inviteCode: 'APIK03' }),
    );
  });

  it('非メンバーは設定（inviteCode）を変更できない', async () => {
    await signInAs(USER_A);
    const group = await createGroup('G', TEST_MEMBERS, USER_A.uid, USER_A.email, 'APIK04');

    // USER_B は当グループの非メンバー
    const bCtx = testEnv.authenticatedContext(USER_B.uid, { email: USER_B.email });
    await assertFails(
      bCtx.firestore().collection('groups').doc(group.id).update({ inviteCode: 'EVIL01' }),
    );
  });
});

describe('招待コードのリネーム', () => {
  it('updateInviteCode で既存グループのコードを変更でき、大文字に正規化される', async () => {
    const group = await createGroup('リネームテスト', TEST_MEMBERS, USER_A.uid, USER_A.email, 'OLD001');

    const result = await updateInviteCode(group.id, 'new99');
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
        createdBy: USER_B.uid,
      });
    });

    // A が自グループを作成し、B のコードへ変更しようとする
    const mine = await createGroup('A', TEST_MEMBERS, USER_A.uid, USER_A.email, 'MINE01');
    await expect(updateInviteCode(mine.id, 'TAKEN1')).rejects.toThrow('この招待コードはすでに使われています');
  });
});
