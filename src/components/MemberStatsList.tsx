import type { Party } from '../types';
import { formatYen } from '../lib/format';
import { emptyDrinks, rosterOf } from '../lib/party';
import { megaTotal, pureAlcoholGrams, beerCans } from '../lib/alcohol';
import { useApp } from '../context/AppContext';

interface MemberStat {
  name: string;
  totalDrinks: number;
  drinks: { beer: number; highball: number; sour: number; other: number };
  amount: number;
  megaCups: number;
  pureAlcohol: number;
}

export function getMemberStats(historyArray: Party[], roster: { id: string; name: string }[]): MemberStat[] {
  const stats: Record<string, MemberStat> = {};
  roster.forEach((m) => {
    stats[m.id] = { name: m.name, totalDrinks: 0, drinks: emptyDrinks(), amount: 0, megaCups: 0, pureAlcohol: 0 };
  });

  historyArray.forEach((p) => {
    p.members?.forEach((m) => {
      if (!stats[m.id]) return;
      stats[m.id].totalDrinks += m.totalDrinks;
      if (m.drinks) {
        stats[m.id].drinks.beer += m.drinks.beer || 0;
        stats[m.id].drinks.highball += m.drinks.highball || 0;
        stats[m.id].drinks.sour += m.drinks.sour || 0;
        stats[m.id].drinks.other += m.drinks.other || 0;
      }
      stats[m.id].megaCups += megaTotal(m);
      stats[m.id].pureAlcohol += pureAlcoholGrams(m);
    });
    if (p.memberAmounts) {
      Object.entries(p.memberAmounts).forEach(([mId, amt]) => {
        if (stats[mId]) stats[mId].amount += amt;
      });
    }
  });

  return Object.values(stats).sort((a, b) => b.amount - a.amount);
}

export function MemberStatsList({ historyArray }: { historyArray: Party[] }) {
  const { state } = useApp();
  const statsArray = getMemberStats(historyArray, rosterOf(state.groupInfo));
  if (statsArray.every((m) => m.amount === 0 && m.totalDrinks === 0 && m.pureAlcohol === 0)) return null;

  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div className="glass p-4 mb-4">
      <h3 className="mb-4 text-center text-sm text-muted">メンバー別 集計</h3>
      <div className="flex flex-col" style={{ gap: '1.1rem' }}>
        {statsArray.map((m, i) => (
          <div key={m.name} style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
            <div className="flex justify-between items-center" style={{ marginBottom: '0.55rem' }}>
              <span className="font-bold">{medals[i] ?? ' '} {m.name}</span>
              <span className="font-bold text-accent" style={{ fontFamily: 'var(--font-pop)' }}>{formatYen(m.amount)}</span>
            </div>
            <div className="flex justify-between text-sm text-muted" style={{ background: 'rgba(0,0,0,0.2)', padding: '0.45rem 0.6rem', borderRadius: 8 }}>
              <div className="flex gap-2">
                <span>🍺{m.drinks.beer}</span>
                <span>🥃{m.drinks.highball}</span>
                <span>🍋{m.drinks.sour}</span>
                <span>🍷{m.drinks.other}</span>
              </div>
              <span className="font-bold">計 {m.totalDrinks} 杯</span>
            </div>
            <div className="text-sm text-muted" style={{ marginTop: '0.5rem', textAlign: 'right' }}>
              {m.megaCups > 0 && <span>メガ {m.megaCups}杯 ・ </span>}
              🍺換算 約{beerCans(m.pureAlcohol).toFixed(1)}本
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
