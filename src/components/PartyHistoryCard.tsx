import type { Party } from '../types';
import { formatYen } from '../lib/format';

interface Props {
  party: Party;
  title: string;
  onEdit: (party: Party) => void;
  onDelete: (party: Party) => void;
}

export function PartyHistoryCard({ party, title, onEdit, onDelete }: Props) {
  return (
    <div className="glass p-3" style={{ fontSize: '0.9rem' }}>
      <div className="flex justify-between items-center mb-1">
        <span style={{ fontWeight: 'bold' }}>{title}</span>
        <span style={{ color: 'var(--accent-color)', fontWeight: 'bold' }}>{formatYen(party.totalAmount || 0)}</span>
      </div>
      {party.summaryText && (
        <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px dashed var(--border-color)', fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
          {party.summaryText}
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.8rem' }}>
        <button onClick={() => onEdit(party)} className="btn btn-sm" style={{ flex: 1, border: '1px dashed var(--border-color)', background: 'transparent' }}>📝 編集</button>
        <button onClick={() => onDelete(party)} className="btn btn-sm" style={{ border: '1px dashed var(--danger-color)', background: 'transparent', color: 'var(--danger-color)' }}>🗑 削除</button>
      </div>
    </div>
  );
}
