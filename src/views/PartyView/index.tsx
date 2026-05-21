import { useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { saveParty, listenToParty } from '../../lib/db';
import type { PartyState } from '../../types';
import { MembersTab } from './MembersTab';
import { SplitTab, calculateSplit } from './SplitTab';
import { SummaryTab } from './SummaryTab';

export function PartyView() {
  const { state, dispatch } = useApp();
  const { partyState, activePartyTab, historyData } = state;
  const listenerRef = useRef<(() => void) | null>(null);

  const isEditing = historyData.some((p) => p._docId === partyState.id);

  useEffect(() => {
    if (!partyState.id) return;
    listenerRef.current = listenToParty(partyState.id, (updated) => {
      if (updated.members && JSON.stringify(updated.members) !== JSON.stringify(partyState.members)) {
        dispatch({ type: 'SET_PARTY_STATE', party: { ...partyState, members: updated.members } });
      }
    });
    return () => { listenerRef.current?.(); };
  }, [partyState.id]);

  function updatePartyState(updated: PartyState) {
    dispatch({ type: 'SET_PARTY_STATE', party: updated });
  }

  async function handleEndParty() {
    const msg = isEditing ? '変更内容を保存しますか？' : '飲み会を終了して履歴に保存しますか？';
    if (!confirm(msg)) return;
    const result = calculateSplit(partyState);
    try {
      await saveParty({
        _docId: partyState.id ?? '',
        id: partyState.id ?? undefined,
        startTime: partyState.startTime ?? new Date().toISOString(),
        endTime: partyState.endTime ?? new Date().toISOString(),
        areaName: partyState.areaName.trim(),
        storeName: partyState.storeName.trim(),
        members: partyState.members,
        totalAmount: partyState.split.totalAmount,
        splitRoles: partyState.split.roles,
        memberAmounts: result.memberAmounts,
        summaryRaw: partyState.summary.rawText,
        summaryText: partyState.summary.result,
      });
      listenerRef.current?.();
      dispatch({ type: 'SET_VIEW', view: isEditing ? 'stats' : 'home' });
    } catch {
      alert('保存に失敗しました。ネットワーク接続を確認してください。');
    }
  }

  function handleCancel() {
    listenerRef.current?.();
    dispatch({ type: 'SET_VIEW', view: 'stats' });
  }

  const tabs = [
    { id: 'members' as const, label: 'メンバー', icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style={{ width: 24, height: 24, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
    { id: 'split' as const, label: '割り勘', icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style={{ width: 24, height: 24, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> },
    { id: 'summary' as const, label: '要約', icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style={{ width: 24, height: 24, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
  ];

  return (
    <>
      <div className="view" style={{ paddingBottom: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
          <div style={{ flex: 1 }}>
            <button
              onClick={handleEndParty}
              className="btn btn-sm"
              style={{ width: '100%', ...(isEditing ? { color: 'var(--accent-color)', fontWeight: 'bold' } : {}) }}
            >
              {isEditing ? '保存' : '終了'}
            </button>
          </div>
          <h2 style={{ flex: 2, textAlign: 'center', margin: 0, fontSize: '1.1rem' }}>
            {isEditing ? '履歴を編集' : '飲み会中'}
          </h2>
          <div style={{ flex: 1 }}>
            {isEditing && (
              <button onClick={handleCancel} className="btn btn-sm" style={{ width: '100%' }}>戻る</button>
            )}
          </div>
        </div>

        <div className="flex mb-4" style={{ gap: '0.5rem' }}>
          <input
            type="text"
            className="input-field"
            style={{ flex: 1, minWidth: 0, padding: '0.5rem 0.4rem', textAlign: 'center', fontSize: '0.9rem', background: 'rgba(0,0,0,0.2)', border: '1px dashed var(--border-color)' }}
            placeholder="エリア (例: 新宿)"
            value={partyState.areaName}
            onChange={(e) => updatePartyState({ ...partyState, areaName: e.target.value })}
          />
          <input
            type="text"
            className="input-field"
            style={{ flex: 1, minWidth: 0, padding: '0.5rem 0.4rem', textAlign: 'center', fontSize: '0.9rem', background: 'rgba(0,0,0,0.2)', border: '1px dashed var(--border-color)' }}
            placeholder="店名を入力"
            value={partyState.storeName}
            onChange={(e) => updatePartyState({ ...partyState, storeName: e.target.value })}
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {activePartyTab === 'members' && <MembersTab partyState={partyState} onUpdate={updatePartyState} />}
          {activePartyTab === 'split' && <SplitTab partyState={partyState} onUpdate={updatePartyState} />}
          {activePartyTab === 'summary' && <SummaryTab partyState={partyState} onUpdate={updatePartyState} />}
        </div>
      </div>

      <nav className="bottom-nav">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => dispatch({ type: 'SET_PARTY_TAB', tab: tab.id })}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              color: activePartyTab === tab.id ? 'var(--accent-color)' : 'var(--text-secondary)',
              fontSize: '0.75rem', fontWeight: 500, gap: '0.25rem',
              cursor: 'pointer', background: 'none', border: 'none', transition: 'color 0.2s',
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </nav>
    </>
  );
}
