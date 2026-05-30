import { FIXED_MEMBERS, SPLIT_ROLES, DRINK_TYPES } from '../constants';
import type { DrinkType, Group, Member, Party, PartyState } from '../types';
import { createParty } from './db';

type Roster = { id: string; name: string }[];

// グループに保存されたメンバーを正とし、未設定時のみ FIXED_MEMBERS にフォールバックする。
// 友人追加・グループ共有機能が入っても、メンバーの出所はこの一点だけを見ればよい。
export function rosterOf(group: Group | null): Roster {
  return group?.members?.length ? group.members : [...FIXED_MEMBERS];
}

// DRINK_TYPES から空のドリンクカウントを生成（種類の増減に自動追従させ、手書き重複を防ぐ）
export function emptyDrinks(): Record<DrinkType, number> {
  return Object.fromEntries(DRINK_TYPES.map((d) => [d.id, 0])) as Record<DrinkType, number>;
}

// roster の全員を「普通」(SPLIT_ROLES[1]) で初期化した傾斜配分マップ
export function defaultSplitRoles(roster: Roster): Record<string, number> {
  const roles: Record<string, number> = {};
  roster.forEach((m) => (roles[m.id] = SPLIT_ROLES[1].id));
  return roles;
}

// roster の全メンバー（ドリンク0）
export function createInitialMembers(roster: Roster): Member[] {
  return roster.map((m) => ({ id: m.id, name: m.name, drinks: emptyDrinks(), totalDrinks: 0 }));
}

// 「アクティブなパーティなし」の空 PartyState（初期状態・ログアウト時。group がまだ無いのでフォールバック roster を使う）
export function emptyPartyState(): PartyState {
  return {
    id: null, areaName: '', storeName: '', startTime: null,
    members: [],
    split: { totalAmount: 0, roles: defaultSplitRoles(rosterOf(null)) },
    summary: { rawText: '', result: '' },
  };
}

// 既存 Party から編集用 PartyState を組み立てる
export function buildEditPartyState(party: Party): PartyState {
  const roles = { ...party.splitRoles };
  if (Object.keys(roles).length === 0) Object.assign(roles, defaultSplitRoles(party.members));
  return {
    id: party._docId, areaName: party.areaName || '', storeName: party.storeName || '',
    startTime: party.startTime, endTime: party.endTime,
    members: party.members,
    split: { totalAmount: party.totalAmount || 0, roles },
    summary: { rawText: party.summaryRaw || '', result: party.summaryText || '' },
  };
}

// 新規パーティを Firestore に作成し、対応する PartyState を返す
export async function createNewParty(roster: Roster, rawText = ''): Promise<PartyState> {
  const roles = defaultSplitRoles(roster);
  const members = createInitialMembers(roster);
  const startTime = new Date().toISOString();
  const id = await createParty({ areaName: '', storeName: '', startTime, members, totalAmount: 0, splitRoles: roles });
  return {
    id, areaName: '', storeName: '', startTime,
    members,
    split: { totalAmount: 0, roles },
    summary: { rawText, result: '' },
  };
}
