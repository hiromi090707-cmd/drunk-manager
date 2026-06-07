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
