import type { DrinkType } from './types';

export const FIXED_MEMBERS = [
  { id: 'hiromi', name: 'ひろみ' },
  { id: 'souga', name: 'そうが' },
  { id: 'takumi', name: 'たくみ' },
  { id: 'takuto', name: 'たくと' },
  { id: 'rui', name: 'るい' },
] as const;

export const DRINK_TYPES: { id: DrinkType; emoji: string; name: string }[] = [
  { id: 'beer', emoji: '🍺', name: 'ビール' },
  { id: 'highball', emoji: '🥃', name: 'ハイボール' },
  { id: 'sour', emoji: '🍋', name: 'サワー' },
  { id: 'other', emoji: '🍷', name: 'その他' },
];

export const SPLIT_ROLES = [
  { id: 1.5, label: '多め', color: 'var(--danger-color)' },
  { id: 1.0, label: '普通', color: 'var(--accent-color)' },
  { id: 0.5, label: '少なめ', color: 'var(--success-color)' },
  { id: 0.0, label: 'ゼロ', color: 'var(--text-secondary)' },
];

export const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
