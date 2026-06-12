import { describe, it, expect } from 'vitest';
import { searchParties } from './search';
import type { Party } from '../types';

function makeParty(over: Partial<Party>): Party {
  return {
    _docId: 'p1',
    areaName: '',
    storeName: '',
    startTime: '2026-06-01T19:00:00.000Z',
    members: [],
    totalAmount: 0,
    splitRoles: {},
    ...over,
  };
}

describe('searchParties', () => {
  it('空クエリ・空白のみのクエリは空配列を返す', () => {
    const parties = [makeParty({ summaryRaw: 'カラオケの話' })];
    expect(searchParties(parties, '')).toEqual([]);
    expect(searchParties(parties, '   ')).toEqual([]);
  });

  it('summaryRaw / summaryText / 店名 / エリアのいずれにもヒットする', () => {
    const parties = [
      makeParty({ _docId: 'a', summaryRaw: '旅行の計画で盛り上がった' }),
      makeParty({ _docId: 'b', summaryText: '・二次会はカラオケ' }),
      makeParty({ _docId: 'c', storeName: '鳥貴族' }),
      makeParty({ _docId: 'd', areaName: '渋谷' }),
    ];
    expect(searchParties(parties, '旅行').map((h) => h.party._docId)).toEqual(['a']);
    expect(searchParties(parties, 'カラオケ').map((h) => h.party._docId)).toEqual(['b']);
    expect(searchParties(parties, '鳥貴族').map((h) => h.party._docId)).toEqual(['c']);
    expect(searchParties(parties, '渋谷').map((h) => h.party._docId)).toEqual(['d']);
  });

  it('ヒットしなければ空配列を返す', () => {
    expect(searchParties([makeParty({ summaryRaw: 'もつ鍋の話' })], '存在しない語')).toEqual([]);
  });

  it('大文字小文字を無視してヒットする', () => {
    const parties = [makeParty({ summaryRaw: 'BBQ をやる話になった' })];
    expect(searchParties(parties, 'bbq')).toHaveLength(1);
  });

  it('結果は startTime の新しい順に並ぶ', () => {
    const parties = [
      makeParty({ _docId: 'old', summaryRaw: '旅行', startTime: '2026-01-01T19:00:00.000Z' }),
      makeParty({ _docId: 'new', summaryRaw: '旅行', startTime: '2026-06-01T19:00:00.000Z' }),
    ];
    expect(searchParties(parties, '旅行').map((h) => h.party._docId)).toEqual(['new', 'old']);
  });

  it('長文ではヒット位置の前後を切り出し、両端に省略記号を付ける', () => {
    const long = 'あ'.repeat(100) + '旅行' + 'い'.repeat(100);
    const [hit] = searchParties([makeParty({ summaryRaw: long })], '旅行');
    expect(hit.snippet).toContain('旅行');
    expect(hit.snippet.startsWith('…')).toBe(true);
    expect(hit.snippet.endsWith('…')).toBe(true);
    expect(hit.snippet.length).toBeLessThan(100);
  });

  it('短いテキストは省略記号なしでそのまま返す', () => {
    const [hit] = searchParties([makeParty({ summaryRaw: '旅行の話' })], '旅行');
    expect(hit.snippet).toBe('旅行の話');
  });

  it('1パーティにつきヒットは1件（summaryRaw 優先）', () => {
    const p = makeParty({ summaryRaw: '旅行A', summaryText: '旅行B' });
    const hits = searchParties([p], '旅行');
    expect(hits).toHaveLength(1);
    expect(hits[0].snippet).toBe('旅行A');
  });
});
