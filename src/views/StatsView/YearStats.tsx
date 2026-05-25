import type { Party } from '../../types';
import { MemberStatsList } from '../../components/MemberStatsList';
import { useApp } from '../../context/AppContext';

interface Props {
  historyData: Party[];
  statsDate: Date;
}

export function YearStats({ historyData, statsDate }: Props) {
  const { dispatch } = useApp();
  const y = statsDate.getFullYear();
  const yearHistory = historyData.filter((p) => new Date(p.startTime).getFullYear() === y);
  const totalSpent = yearHistory.reduce((s, p) => s + (p.totalAmount || 0), 0);
  const monthTotals = Array(12).fill(0) as number[];
  yearHistory.forEach((p) => { monthTotals[new Date(p.startTime).getMonth()] += p.totalAmount || 0; });
  const maxMonth = Math.max(...monthTotals, 1);

  function changeYear(delta: number) {
    const next = new Date(statsDate);
    next.setFullYear(next.getFullYear() + delta);
    dispatch({ type: 'SET_STATS_DATE', date: next });
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4 glass p-2">
        <button onClick={() => changeYear(-1)} className="btn btn-sm" style={{ border: 'none', background: 'transparent' }}>◀</button>
        <span style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{y}年</span>
        <button onClick={() => changeYear(1)} className="btn btn-sm" style={{ border: 'none', background: 'transparent' }}>▶</button>
      </div>
      <div className="text-center mb-4">
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{y}年の総利用額</div>
        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--accent-color)' }}>¥{totalSpent.toLocaleString()}</div>
        <div style={{ color: 'var(--text-secondary)', marginTop: '0.25rem', fontSize: '0.9rem' }}>開催回数: {yearHistory.length}回</div>
      </div>
      <MemberStatsList historyArray={yearHistory} />
      <div className="glass p-4 mb-4">
        <h3 className="text-center mb-4" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>月別利用額</h3>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: 150, paddingBottom: 20, borderBottom: '1px solid var(--border-color)' }}>
          {monthTotals.map((amount, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '6%', height: '100%', justifyContent: 'flex-end', position: 'relative' }}>
              {amount > 0 && <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', marginBottom: 2, writingMode: 'vertical-rl', textOrientation: 'mixed', transform: 'rotate(180deg)' }}>{Math.round(amount / 1000)}k</div>}
              <div style={{ width: '100%', height: `${(amount / maxMonth) * 100}%`, background: 'var(--accent-gradient)', borderRadius: '4px 4px 0 0', minHeight: amount > 0 ? 4 : 0 }} />
              <div style={{ position: 'absolute', bottom: -20, left: 0, right: 0, textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{i + 1}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
