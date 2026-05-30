import type { Party } from '../types';

export function formatYen(amount: number): string {
  return `¥${amount.toLocaleString()}`;
}

// 店名 → エリア名 → デフォルト の順でフォールバック
export function partyName(party: Party): string {
  return party.storeName || party.areaName || '名もなき飲み会';
}
