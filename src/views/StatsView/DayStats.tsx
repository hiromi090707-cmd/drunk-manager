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

export function DayStats({ historyData, statsDate, onEditParty, onDeleteParty }: Props) {
  const { dispatch } = useApp();
  const y = statsDate.getFullYear(), m = statsDate.getMonth(), d = statsDate.getDate();
  const dayHistory = historyData.filter((p) => {
    const pd = new Date(p.startTime);
    return pd.getFullYear() === y && pd.getMonth() === m && pd.getDate() === d;
  });
  const totalSpent = dayHistory.reduce((s, p) => s + (p.totalAmount || 0), 0);
  const sorted = [...dayHistory].sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

  function changeDate(delta: number) {
    const next = new Date(statsDate);
    next.setDate(next.getDate() + delta);
    dispatch({ type: 'SET_STATS_DATE', date: next });
  }

  return (
    <div>
      <DateNavigator label={`${y}年 ${m + 1}月 ${d}日`} onPrev={() => changeDate(-1)} onNext={() => changeDate(1)} />
      <div className="mb-4">
        <StatMetric label="この日の利用額" value={formatYen(totalSpent)} accent caption={`開催回数: ${dayHistory.length}回`} />
      </div>
      <MemberStatsList historyArray={dayHistory} />
      <h3 className="text-muted" style={{ marginBottom: '0.5rem', fontSize: '0.9rem' }}>この日の履歴</h3>
      <div className="flex flex-col gap-3 mb-4">
        {dayHistory.length === 0 && <p className="text-center text-muted" style={{ fontSize: '0.9rem' }}>記録がありません</p>}
        {sorted.map((p) => {
          const time = new Date(p.startTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
          return (
            <PartyHistoryCard
              key={p._docId}
              party={p}
              title={`${time} ~ ${partyName(p)}`}
              onEdit={onEditParty}
              onDelete={onDeleteParty}
            />
          );
        })}
      </div>
    </div>
  );
}
