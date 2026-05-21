import type { Party } from '../../types';
import { MemberStatsList } from '../../components/MemberStatsList';

interface Props {
  historyData: Party[];
}

export function AllStats({ historyData }: Props) {
  const totalParties = historyData.length;
  const totalSpent = historyData.reduce((sum, p) => sum + (p.totalAmount || 0), 0);

  return (
    <div>
      <div className="glass p-4 mb-4 text-center">
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>累計開催回数</div>
        <div style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '1rem' }}>{totalParties} 回</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>累計利用額</div>
        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--accent-color)' }}>¥{totalSpent.toLocaleString()}</div>
      </div>
      <MemberStatsList historyArray={historyData} />
    </div>
  );
}
