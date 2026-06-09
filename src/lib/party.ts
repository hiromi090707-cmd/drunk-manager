import { FIXED_MEMBERS, SPLIT_ROLES, DRINK_TYPES } from '../constants';
import type { DrinkType, Group, Member, Party, PartyState } from '../types';
import { createParty } from './db';
import { activeRoster } from './roster';

type Roster = { id: string; name: string }[];

// group が null のとき（初期/ログアウト時）だけ FIXED_MEMBERS にフォールバックする。
// group があれば、たとえ名簿が空（新規グループ）でもそれを尊重し、removed は除外する。
export function rosterOf(group: Group | null): Roster {
  if (!group) return [...FIXED_MEMBERS];
  return activeRoster(group.members ?? []);
}

// DRINK_TYPES から空のドリンクカウントを生成（種類の増減に自動追従させ、手書き重複を防ぐ）
export function emptyDrinks(): Record<DrinkType, number> {
  return Object.fromEntries(DRINK_TYPES.map((d) => [d.id, 0])) as Record<DrinkType, number>;
}

// 1メンバー分の「全ドリンク0」Member を作る（進行中パーティへの途中追加に使う）。
export function zeroMember(m: { id: string; name: string }): Member {
  return { id: m.id, name: m.name, drinks: emptyDrinks(), megaDrinks: emptyDrinks(), totalDrinks: 0 };
}

// roster の全員を「普通」(SPLIT_ROLES[1]) で初期化した傾斜配分マップ
export function defaultSplitRoles(roster: Roster): Record<string, number> {
  const roles: Record<string, number> = {};
  roster.forEach((m) => (roles[m.id] = SPLIT_ROLES[1].id));
  return roles;
}

// roster の全メンバー（ドリンク0）
export function createInitialMembers(roster: Roster): Member[] {
  return roster.map((m) => ({ id: m.id, name: m.name, drinks: emptyDrinks(), megaDrinks: emptyDrinks(), totalDrinks: 0 }));
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
    members: party.members.map((m) => ({ ...m, megaDrinks: m.megaDrinks ?? emptyDrinks() })),
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

// Firestore から読んだ raw members（マップ / 旧配列 / 欠損）を常に Member[] に正規化する。
// 既存履歴（配列形式）も新形式（マップ）も透過的に扱えるため、データ移行が不要になる。
export function membersToArray(raw: unknown): Member[] {
  if (Array.isArray(raw)) return raw as Member[];
  if (raw && typeof raw === 'object') return Object.values(raw as Record<string, Member>);
  return [];
}

// 進行中（endTime を持たない）の party を1件返す。history は startTime 降順前提なので
// 先頭にヒットした最新の進行中を返す。無ければ null。
export function findActiveParty(history: Party[]): Party | null {
  return history.find((p) => !p.endTime) ?? null;
}

// アプリ内部の Member[] を Firestore 保存用マップ（id キー）に変換する。
// マップ化により members.<id> 単位の部分更新が可能になり、メンバー間の更新衝突を防げる。
export function membersToMap(members: Member[]): Record<string, Member> {
  return Object.fromEntries(members.map((m) => [m.id, m]));
}

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
