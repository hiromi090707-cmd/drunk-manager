import type { Party } from '../types';
import { partyName } from '../lib/format';

interface Props {
  party: Party;
  onClose: () => void;
}

export function TranscriptModal({ party, onClose }: Props) {
  const date = new Date(party.startTime).toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'short', day: 'numeric',
  });

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(12, 8, 5, 0.93)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
      }}
    >
      <div
        className="glass p-4"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 420, width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
      >
        <div className="flex justify-between items-center mb-3">
          <div>
            <div style={{ fontWeight: 'bold' }}>{partyName(party)}</div>
            <div className="text-muted" style={{ fontSize: '0.8rem' }}>{date}</div>
          </div>
          <button onClick={onClose} className="btn btn-sm">閉じる</button>
        </div>
        <div
          className="text-muted"
          style={{ flex: 1, minHeight: 0, overflowY: 'auto', whiteSpace: 'pre-wrap', fontSize: '0.85rem', lineHeight: 1.7 }}
        >
          {party.summaryRaw || party.summaryText || '記録テキストはありません'}
        </div>
      </div>
    </div>
  );
}
