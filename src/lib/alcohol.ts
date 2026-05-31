import { DRINK_TYPES, MEGA_VOLUME_FACTOR, BEER_CAN_GRAMS } from '../constants';
import type { Member } from '../types';

const ETHANOL_DENSITY = 0.8;

// 純アルコール量(g) = Σ (普通杯 + メガ杯×倍率) × ml × abv/100 × 0.8
export function pureAlcoholGrams(member: Member): number {
  return DRINK_TYPES.reduce((sum, d) => {
    const regular = member.drinks?.[d.id] || 0;
    const mega = member.megaDrinks?.[d.id] || 0;
    const perCup = (d.ml * d.abv / 100) * ETHANOL_DENSITY;
    return sum + regular * perCup + mega * perCup * MEGA_VOLUME_FACTOR;
  }, 0);
}

// メガ杯の合計（全ドリンク種）
export function megaTotal(member: Member): number {
  return DRINK_TYPES.reduce((sum, d) => sum + (member.megaDrinks?.[d.id] || 0), 0);
}

// 缶ビール換算本数
export function beerCans(grams: number): number {
  return grams / BEER_CAN_GRAMS;
}
