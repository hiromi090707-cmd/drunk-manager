import { useState } from 'react';
import type { Party } from '../../types';
import { searchParties } from '../../lib/search';
import { partyName } from '../../lib/format';
import { TranscriptModal } from '../../components/TranscriptModal';

export function SearchStats({ historyData }: { historyData: Party[] }) {
  const [query, setQuery] = useState('');
  const [openParty, setOpenParty] = useState<Party | null>(null);
  const hits = searchParties(historyData, query);

  return (
    <div>
      <input
        className="input-field w-full mb-3"
        placeholder="キーワードで思い出を検索"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query.trim() !== '' && hits.length === 0 && (
        <p className="text-center text-muted" style={{ fontSize: '0.85rem' }}>見つかりませんでした</p>
      )}
      <div className="flex flex-col gap-2">
        {hits.map(({ party, snippet }) => {
          const date = new Date(party.startTime).toLocaleDateString('ja-JP', {
            year: 'numeric', month: 'short', day: 'numeric',
          });
          return (
            <button
              key={party._docId}
              onClick={() => setOpenParty(party)}
              className="glass p-3 text-left"
              style={{ cursor: 'pointer' }}
            >
              <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{date} {partyName(party)}</div>
              <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.3rem' }}>{snippet}</div>
            </button>
          );
        })}
      </div>
      {openParty && <TranscriptModal party={openParty} onClose={() => setOpenParty(null)} />}
    </div>
  );
}
