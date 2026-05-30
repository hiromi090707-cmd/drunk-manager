import type { Party } from '../../types';
import { MemberStatsList } from '../../components/MemberStatsList';
import { StatMetric } from '../../components/StatMetric';
import { formatYen } from '../../lib/format';

interface Props {
  historyData: Party[];
}

export function AllStats({ historyData }: Props) {
  const totalParties = historyData.length;
  const totalSpent = historyData.reduce((sum, p) => sum + (p.totalAmount || 0), 0);

  return (
    <div>
      <div className="glass p-4 mb-4" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <StatMetric label="累計開催回数" value={<>{totalParties} 回</>} />
        <StatMetric label="累計利用額" value={formatYen(totalSpent)} accent />
      </div>
      <MemberStatsList historyArray={historyData} />
    </div>
  );
}
