import { useState } from 'react';
import type { Party } from '../types';
import { formatYen } from '../lib/format';
import { TranscriptModal } from './TranscriptModal';

interface Props {
  party: Party;
  title: string;
  onEdit: (party: Party) => void;
  onDelete: (party: Party) => void;
}

export function PartyHistoryCard({ party, title, onEdit, onDelete }: Props) {
  const [showTranscript, setShowTranscript] = useState(false);

  return (
    <div className="glass p-3" style={{ fontSize: '0.9rem' }}>
      <div className="flex justify-between items-center mb-1">
        <span style={{ fontWeight: 'bold' }}>{title}</span>
        <span className="text-accent" style={{ fontWeight: 'bold' }}>{formatYen(party.totalAmount || 0)}</span>
      </div>
      {party.summaryText && (
        <div className="text-muted" style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px dashed var(--border-color)', fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>
          {party.summaryText}
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.8rem' }}>
        <button onClick={() => onEdit(party)} className="btn btn-sm btn-dashed" style={{ flex: 1 }}>📝 編集</button>
        {party.summaryRaw && (
          <button onClick={() => setShowTranscript(true)} className="btn btn-sm btn-dashed">📜 全文</button>
        )}
        <button onClick={() => onDelete(party)} className="btn btn-sm btn-dashed-danger">🗑 削除</button>
      </div>
      {showTranscript && <TranscriptModal party={party} onClose={() => setShowTranscript(false)} />}
    </div>
  );
}
