import type { Party } from '../types';

export interface SearchHit {
  party: Party;
  snippet: string;
}

const SNIPPET_RADIUS = 40;

// 検索対象フィールド（summaryRaw 優先の順）
function fieldsOf(party: Party): string[] {
  return [party.summaryRaw, party.summaryText, party.storeName, party.areaName]
    .filter((s): s is string => !!s);
}

function makeSnippet(text: string, index: number, queryLength: number): string {
  const start = Math.max(0, index - SNIPPET_RADIUS);
  const end = Math.min(text.length, index + queryLength + SNIPPET_RADIUS);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

// historyData（購読済み・全件メモリ上）に対するクライアント内検索。
// 大文字小文字を無視した単純 includes。結果は startTime の新しい順。
export function searchParties(parties: Party[], query: string): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const hits: SearchHit[] = [];
  for (const party of parties) {
    for (const text of fieldsOf(party)) {
      const index = text.toLowerCase().indexOf(q);
      if (index >= 0) {
        hits.push({ party, snippet: makeSnippet(text, index, q.length) });
        break;
      }
    }
  }
  return hits.sort(
    (a, b) => new Date(b.party.startTime).getTime() - new Date(a.party.startTime).getTime(),
  );
}
