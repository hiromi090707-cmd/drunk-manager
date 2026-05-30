import { useApp } from '../context/AppContext';
import { buildEditPartyState, createNewParty, rosterOf } from '../lib/party';
import { formatYen, partyName } from '../lib/format';

export function ShareChoiceView() {
  const { state, dispatch } = useApp();
  const { historyData, sharedText } = state;
  const recentParties = [...historyData].sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()).slice(0, 5);

  async function handleShareNew() {
    try {
      const newParty = await createNewParty(rosterOf(state.groupInfo), sharedText);
      dispatch({ type: 'SET_PARTY_STATE', party: newParty });
      dispatch({ type: 'SET_PARTY_TAB', tab: 'summary' });
      dispatch({ type: 'SET_VIEW', view: 'party' });
    } catch {
      alert('飲み会の開始に失敗しました。');
    }
  }

  function handleAttach(partyId: string) {
    const party = historyData.find((p) => p._docId === partyId);
    if (!party) return;
    const partyState = buildEditPartyState(party);
    dispatch({ type: 'SET_PARTY_STATE', party: { ...partyState, summary: { ...partyState.summary, rawText: sharedText } } });
    dispatch({ type: 'SET_PARTY_TAB', tab: 'summary' });
    dispatch({ type: 'SET_VIEW', view: 'party' });
  }

  return (
    <div className="view">
      <div className="text-center mt-4 mb-4">
        <h2 style={{ fontSize: '1.2rem' }}>共有されたテキストの追加</h2>
        <p className="text-muted" style={{ fontSize: '0.8rem' }}>どこに追加するか選んでください</p>
      </div>
      <div className="glass p-3 mb-4 text-muted" style={{ fontSize: '0.8rem', maxHeight: 100, overflowY: 'auto' }}>
        {sharedText}
      </div>
      <button onClick={handleShareNew} className="btn btn-primary w-full p-3 mb-4" style={{ fontSize: '1.125rem' }}>
        🍺 新しく飲み会を始める
      </button>
      <h3 className="text-muted" style={{ marginBottom: '0.75rem', marginTop: '1rem', textAlign: 'center', fontSize: '0.9rem' }}>最近の履歴に紐付ける</h3>
      <div className="flex flex-col gap-2">
        {recentParties.length === 0 && <p className="text-center text-muted">履歴がありません</p>}
        {recentParties.map((p) => {
          const date = new Date(p.startTime).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
          return (
            <button
              key={p._docId}
              onClick={() => handleAttach(p._docId)}
              className="btn text-left"
              style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', border: '1px solid var(--border-color)', borderRadius: 8 }}
            >
              <div style={{ fontWeight: 'bold', fontSize: '1rem' }}>{date} {partyName(p)}</div>
              <div className="text-muted" style={{ fontSize: '0.8rem' }}>{formatYen(p.totalAmount || 0)}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
