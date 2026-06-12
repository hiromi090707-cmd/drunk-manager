import type { DrinkType } from './types';

export const FIXED_MEMBERS = [
  { id: 'hiromi', name: 'ひろみ' },
  { id: 'souga', name: 'そうが' },
  { id: 'takumi', name: 'たくみ' },
  { id: 'takuto', name: 'たくと' },
  { id: 'rui', name: 'るい' },
] as const;

export const DRINK_TYPES: { id: DrinkType; emoji: string; name: string; ml: number; abv: number }[] = [
  { id: 'beer', emoji: '🍺', name: 'ビール', ml: 350, abv: 5 },
  { id: 'highball', emoji: '🥃', name: 'ハイボール', ml: 350, abv: 7 },
  { id: 'sour', emoji: '🍋', name: 'サワー', ml: 350, abv: 6 },
  { id: 'other', emoji: '🍷', name: 'その他', ml: 180, abv: 12 },
];

export const MEGA_VOLUME_FACTOR = 2; // メガ = 通常容量の2倍
export const BEER_CAN_GRAMS = 14;    // 缶ビール1本(350ml/5%)の純アルコール量。換算基準

export const SPLIT_ROLES = [
  { id: 1.5, label: '多め', color: 'var(--danger-color)' },
  { id: 1.0, label: '普通', color: 'var(--accent-color)' },
  { id: 0.5, label: '少なめ', color: 'var(--success-color)' },
  { id: 0.0, label: 'ゼロ', color: 'var(--text-secondary)' },
];

