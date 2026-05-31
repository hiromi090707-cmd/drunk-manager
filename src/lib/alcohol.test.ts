// 純関数のテストだが、共通 setup.ts が Emulator 起動を要求するため `npm run test:emulators` で実行する。
import { describe, it, expect } from 'vitest';
import { pureAlcoholGrams, megaTotal, beerCans } from './alcohol';
import type { Member } from '../types';

function member(over: Partial<Member>): Member {
  return {
    id: 'x', name: 'X',
    drinks: { beer: 0, highball: 0, sour: 0, other: 0 },
    totalDrinks: 0,
    ...over,
  };
}

describe('alcohol', () => {
  it('pureAlcoholGrams: 普通＋メガ混在を合算する', () => {
    const m = member({
      drinks: { beer: 3, highball: 2, sour: 0, other: 0 },
      megaDrinks: { beer: 1, highball: 0, sour: 0, other: 0 },
    });
    // ビール普通3×14 + ビールメガ1×28 + ハイボール普通2×19.6 = 42 + 28 + 39.2 = 109.2
    expect(pureAlcoholGrams(m)).toBeCloseTo(109.2, 1);
  });

  it('pureAlcoholGrams: megaDrinks 未定義でも普通杯から算出する', () => {
    const m = member({ drinks: { beer: 2, highball: 0, sour: 0, other: 0 } });
    expect(pureAlcoholGrams(m)).toBeCloseTo(28.0, 1); // 2×14
  });

  it('megaTotal: 全ドリンク種のメガ杯を合計する', () => {
    const m = member({ megaDrinks: { beer: 1, highball: 2, sour: 0, other: 0 } });
    expect(megaTotal(m)).toBe(3);
  });

  it('megaTotal: megaDrinks 未定義は0', () => {
    expect(megaTotal(member({}))).toBe(0);
  });

  it('beerCans: 純アルコールgを缶ビール本数に換算する', () => {
    expect(beerCans(109.2)).toBeCloseTo(7.8, 1);
    expect(beerCans(14)).toBe(1);
  });
});
