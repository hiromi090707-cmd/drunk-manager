import type { Party } from '../../types';
import { MemberStatsList } from '../../components/MemberStatsList';
import { useApp } from '../../context/AppContext';
import { DateNavigator } from '../../components/DateNavigator';
import { StatMetric } from '../../components/StatMetric';
import { PartyHistoryCard } from '../../components/PartyHistoryCard';
import { formatYen, partyName } from '../../lib/format';

interface Props {
  historyData: Party[];
  statsDate: Date;
  onEditParty: (party: Party) => void;
  onDeleteParty: (party: Party) => void;
}

export function MonthStats({ historyData, statsDate, onEditParty, onDeleteParty }: Props) {
  const { dispatch } = useApp();
  const y = statsDate.getFullYear(), m = statsDate.getMonth();
  const monthHistory = historyData.filter((p) => {
    const d = new Date(p.startTime);
    return d.getFullYear() === y && d.getMonth() === m;
  });
  const totalSpent = monthHistory.reduce((s, p) => s + (p.totalAmount || 0), 0);

  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const firstDay = new Date(y, m, 1).getDay();
  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) calendarDays.push(null);
  for (let i = 1; i <= daysInMonth; i++) calendarDays.push(i);
  const partyDays = monthHistory.map((p) => new Date(p.startTime).getDate());
  const sorted = [...monthHistory].sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

  function changeMonth(delta: number) {
    const next = new Date(statsDate);
    next.setMonth(next.getMonth() + delta);
    dispatch({ type: 'SET_STATS_DATE', date: next });
  }

  return (
    <div>
      <DateNavigator label={`${y}年 ${m + 1}月`} onPrev={() => changeMonth(-1)} onNext={() => changeMonth(1)} />
      <div className="flex justify-between items-center mb-4 px-2">
        <StatMetric label="開催回数" size="md" value={<>{monthHistory.length}<span style={{ fontSize: '1rem', fontWeight: 'normal' }}>回</span></>} />
        <StatMetric label="利用金額" size="md" accent value={formatYen(totalSpent)} />
      </div>
      <MemberStatsList historyArray={monthHistory} />
      <div className="glass p-3 mb-4">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, textAlign: 'center', marginBottom: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          {['日','月','火','水','木','金','土'].map((d) => <div key={d}>{d}</div>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center' }}>
          {calendarDays.map((day, i) => {
            if (!day) return <div key={i} style={{ padding: '0.5rem' }} />;
            const hasParty = partyDays.includes(day);
            return (
              <div key={day} style={{ padding: '0.4rem 0', borderRadius: 4, background: hasParty ? 'var(--accent-color)' : 'rgba(255,255,255,0.05)', color: hasParty ? '#fff' : 'inherit', fontWeight: hasParty ? 'bold' : 'normal', position: 'relative' }}>
                {day}
                {hasParty && <div style={{ position: 'absolute', bottom: -2, left: '50%', transform: 'translateX(-50%)', fontSize: '0.5rem' }}>🍺</div>}
              </div>
            );
          })}
        </div>
      </div>
      <h3 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>{m + 1}月の履歴</h3>
      <div className="flex flex-col gap-3 mb-4">
        {monthHistory.length === 0 && <p className="text-center" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>記録がありません</p>}
        {sorted.map((p) => {
          const d = new Date(p.startTime);
          return (
            <PartyHistoryCard
              key={p._docId}
              party={p}
              title={`${d.getDate()}日: ${partyName(p)}`}
              onEdit={onEditParty}
              onDelete={onDeleteParty}
            />
          );
        })}
      </div>
    </div>
  );
}
