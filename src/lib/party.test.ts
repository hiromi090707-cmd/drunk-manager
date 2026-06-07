import { describe, it, expect } from 'vitest';
import { membersToArray, membersToMap, mergeMembers, findActiveParty } from './party';
import type { Member, Party } from '../types';

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

describe('mergeMembers', () => {
  const m = (id: string, beer: number): Member => ({
    id, name: id, drinks: { beer, highball: 0, sour: 0, other: 0 },
    megaDrinks: { beer: 0, highball: 0, sour: 0, other: 0 }, totalDrinks: beer,
  });

  it('他メンバーの更新を取り込み、変化のないメンバーは保持する', () => {
    const current = [m('x', 2), m('y', 0)];
    const incoming = [m('x', 2), m('y', 5)]; // y だけ変化
    const { merged, changed } = mergeMembers(current, incoming);
    expect(changed).toBe(true);
    expect(merged.find((p) => p.id === 'x')!.totalDrinks).toBe(2); // 自分の入力中 x は保持
    expect(merged.find((p) => p.id === 'y')!.totalDrinks).toBe(5); // 他人の y を取り込む
  });

  it('変化が無ければ changed=false（再描画を起こさない）', () => {
    const current = [m('x', 2), m('y', 3)];
    const incoming = [m('x', 2), m('y', 3)];
    const { changed } = mergeMembers(current, incoming);
    expect(changed).toBe(false);
  });

  it('incoming にしか無いメンバーは取り込まない（固定ロスター前提）', () => {
    const current = [m('x', 1)];
    const incoming = [m('x', 1), m('z', 9)];
    const { merged } = mergeMembers(current, incoming);
    expect(merged.map((p) => p.id)).toEqual(['x']);
  });
});
