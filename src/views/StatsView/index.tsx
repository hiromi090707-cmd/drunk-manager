import { useApp } from '../../context/AppContext';
import { DayStats } from './DayStats';
import { MonthStats } from './MonthStats';
import { YearStats } from './YearStats';
import { AllStats } from './AllStats';
import { SearchStats } from './SearchStats';
import { buildEditPartyState } from '../../lib/party';
import { deleteParty } from '../../lib/db';
import type { Party } from '../../types';

const STAT_TABS = [
  { id: 'day' as const, label: '日別' },
  { id: 'month' as const, label: '月別' },
  { id: 'year' as const, label: '年別' },
  { id: 'all' as const, label: '全期間' },
  { id: 'search' as const, label: '検索' },
];

export function StatsView() {
  const { state, dispatch } = useApp();
  const { historyData, activeStatsTab, statsDate } = state;

  function handleEditParty(party: Party) {
    const partyState = buildEditPartyState(party);
    dispatch({ type: 'SET_EDITING_EXISTING', value: true });
    dispatch({ type: 'SET_PARTY_STATE', party: partyState });
    dispatch({ type: 'SET_PARTY_TAB', tab: 'summary' });
    dispatch({ type: 'SET_VIEW', view: 'party' });
  }

  async function handleDeleteParty(party: Party) {
    if (!confirm('この飲み会の記録を削除しますか？')) return;
    await deleteParty(party._docId);
  }

  return (
    <div className="view">
      <div className="flex justify-between items-center mb-4">
        <button onClick={() => dispatch({ type: 'SET_VIEW', view: 'home' })} className="btn btn-sm">＜ 戻る</button>
        <h2 style={{ margin: 0, fontSize: '1.2rem' }}>ダッシュボード</h2>
        <div style={{ width: 50 }} />
      </div>

      <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', borderRadius: 13, padding: '0.2rem', marginBottom: '1rem', border: '2px solid var(--border-color)' }}>
        {STAT_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => dispatch({ type: 'SET_STATS_TAB', tab: tab.id })}
            style={{
              flex: 1, border: 'none', borderRadius: 9, padding: '0.4rem',
              fontFamily: 'var(--font-pop)',
              background: activeStatsTab === tab.id ? 'var(--accent-gradient)' : 'transparent',
              color: activeStatsTab === tab.id ? '#3a1402' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeStatsTab === 'day' && <DayStats historyData={historyData} statsDate={statsDate} onEditParty={handleEditParty} onDeleteParty={handleDeleteParty} />}
      {activeStatsTab === 'month' && <MonthStats historyData={historyData} statsDate={statsDate} onEditParty={handleEditParty} onDeleteParty={handleDeleteParty} />}
      {activeStatsTab === 'year' && <YearStats historyData={historyData} statsDate={statsDate} />}
      {activeStatsTab === 'all' && <AllStats historyData={historyData} />}
      {activeStatsTab === 'search' && <SearchStats historyData={historyData} />}
    </div>
  );
}
