import { FIXED_MEMBERS, SPLIT_ROLES, DRINK_TYPES } from '../constants';
import type { DrinkType, Member, Party, PartyState } from '../types';
import { createParty } from './db';

// DRINK_TYPES から空のドリンクカウントを生成（種類の増減に自動追従させ、手書き重複を防ぐ）
export function emptyDrinks(): Record<DrinkType, number> {
  return Object.fromEntries(DRINK_TYPES.map((d) => [d.id, 0])) as Record<DrinkType, number>;
}

// 全メンバーを「普通」(SPLIT_ROLES[1]) で初期化した傾斜配分マップ
export function defaultSplitRoles(): Record<string, number> {
  const roles: Record<string, number> = {};
  FIXED_MEMBERS.forEach((m) => (roles[m.id] = SPLIT_ROLES[1].id));
  return roles;
}

// 新規パーティ用の全メンバー（ドリンク0）
export function createInitialMembers(): Member[] {
  return FIXED_MEMBERS.map((m) => ({ ...m, drinks: emptyDrinks(), totalDrinks: 0 }));
}

// 「アクティブなパーティなし」の空 PartyState（AppContext の初期状態・ログアウト時に使う。members は空）
export function emptyPartyState(): PartyState {
  return {
    id: null, areaName: '', storeName: '', startTime: null,
    members: [],
    split: { totalAmount: 0, roles: defaultSplitRoles() },
    summary: { rawText: '', result: '' },
  };
}

// 既存 Party から編集用 PartyState を組み立てる
export function buildEditPartyState(party: Party): PartyState {
  const roles = { ...party.splitRoles };
  if (Object.keys(roles).length === 0) Object.assign(roles, defaultSplitRoles());
  return {
    id: party._docId, areaName: party.areaName || '', storeName: party.storeName || '',
    startTime: party.startTime, endTime: party.endTime,
    members: party.members,
    split: { totalAmount: party.totalAmount || 0, roles },
    summary: { rawText: party.summaryRaw || '', result: party.summaryText || '' },
  };
}

// 新規パーティを Firestore に作成し、対応する PartyState を返す
export async function createNewParty(rawText = ''): Promise<PartyState> {
  const roles = defaultSplitRoles();
  const members = createInitialMembers();
  const startTime = new Date().toISOString();
  const id = await createParty({ areaName: '', storeName: '', startTime, members, totalAmount: 0, splitRoles: roles });
  return {
    id, areaName: '', storeName: '', startTime,
    members,
    split: { totalAmount: 0, roles },
    summary: { rawText, result: '' },
  };
}
