import type { Party, PartyState } from '../../types';
import { MemberStatsList } from '../../components/MemberStatsList';
import { useApp } from '../../context/AppContext';
import { FIXED_MEMBERS, SPLIT_ROLES } from '../../constants';
import { deleteParty } from '../../lib/db';

interface Props {
  historyData: Party[];
  statsDate: Date;
  onEditParty: (party: Party) => void;
}

export function DayStats({ historyData, statsDate, onEditParty }: Props) {
  const { dispatch } = useApp();
  const y = statsDate.getFullYear(), m = statsDate.getMonth(), d = statsDate.getDate();
  const dayHistory = historyData.filter((p) => {
    const pd = new Date(p.startTime);
    return pd.getFullYear() === y && pd.getMonth() === m && pd.getDate() === d;
  });
  const totalSpent = dayHistory.reduce((s, p) => s + (p.totalAmount || 0), 0);

  function changeDate(delta: number) {
    const next = new Date(statsDate);
    next.setDate(next.getDate() + delta);
    dispatch({ type: 'SET_STATS_DATE', date: next });
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4 glass p-2">
        <button onClick={() => changeDate(-1)} className="btn btn-sm" style={{ border: 'none', background: 'transparent' }}>◀</button>
        <span style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{y}年 {m + 1}月 {d}日</span>
        <button onClick={() => changeDate(1)} className="btn btn-sm" style={{ border: 'none', background: 'transparent' }}>▶</button>
      </div>
      <div className="text-center mb-4">
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>この日の利用額</div>
        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--accent-color)' }}>¥{totalSpent.toLocaleString()}</div>
        <div style={{ color: 'var(--text-secondary)', marginTop: '0.25rem', fontSize: '0.9rem' }}>開催回数: {dayHistory.length}回</div>
      </div>
      <MemberStatsList historyArray={dayHistory} />
      <h3 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>この日の履歴</h3>
      <div className="flex flex-col gap-3 mb-4">
        {dayHistory.length === 0 && <p className="text-center" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>記録がありません</p>}
        {[...dayHistory].sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()).map((p) => {
          const time = new Date(p.startTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
          return (
            <div key={p._docId} className="glass p-3" style={{ fontSize: '0.9rem' }}>
              <div className="flex justify-between items-center mb-1">
                <span style={{ fontWeight: 'bold' }}>{time} ~ {p.storeName || p.areaName || '名もなき飲み会'}</span>
                <span style={{ color: 'var(--accent-color)', fontWeight: 'bold' }}>¥{(p.totalAmount || 0).toLocaleString()}</span>
              </div>
              {p.summaryText && <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px dashed var(--border-color)', fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{p.summaryText}</div>}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.8rem' }}>
                <button onClick={() => onEditParty(p)} className="btn btn-sm" style={{ flex: 1, border: '1px dashed var(--border-color)', background: 'transparent' }}>📝 編集</button>
                <button
                  onClick={async () => {
                    if (!confirm('この飲み会の記録を削除しますか？')) return;
                    await deleteParty(p._docId);
                  }}
                  className="btn btn-sm"
                  style={{ border: '1px dashed var(--danger-color)', background: 'transparent', color: 'var(--danger-color)' }}
                >🗑 削除</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function buildEditPartyState(party: Party): PartyState {
  const roles = { ...party.splitRoles };
  if (Object.keys(roles).length === 0) {
    FIXED_MEMBERS.forEach((m) => (roles[m.id] = SPLIT_ROLES[1].id));
  }
  return {
    id: party._docId, areaName: party.areaName || '', storeName: party.storeName || '',
    startTime: party.startTime, endTime: party.endTime,
    members: party.members,
    split: { totalAmount: party.totalAmount || 0, roles },
    summary: { rawText: party.summaryRaw || '', result: party.summaryText || '' },
  };
}
