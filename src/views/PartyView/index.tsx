import { useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { saveParty, listenToParty } from '../../lib/db';
import { mergeMembers, orderByRoster } from '../../lib/party';
import type { PartyState } from '../../types';
import { MembersTab } from './MembersTab';
import { SplitTab, calculateSplit } from './SplitTab';
import { SummaryTab } from './SummaryTab';

export function PartyView() {
  const { state, dispatch } = useApp();
  const { partyState, activePartyTab, editingExistingParty: isEditing } = state;
  const listenerRef = useRef<(() => void) | null>(null);
  const partyStateRef = useRef(partyState);
  partyStateRef.current = partyState;

  useEffect(() => {
    if (!partyState.id) return;
    listenerRef.current = listenToParty(partyState.id, (updated) => {
      const current = partyStateRef.current;
      const { merged, changed } = mergeMembers(current.members, updated.members ?? []);
      if (changed) {
        dispatch({ type: 'SET_PARTY_STATE', party: { ...current, members: merged } });
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
      dispatch({ type: 'SET_EDITING_EXISTING', value: false });
      dispatch({ type: 'SET_VIEW', view: isEditing ? 'stats' : 'home' });
    } catch {
      alert('保存に失敗しました。ネットワーク接続を確認してください。');
    }
  }

  function handleCancel() {
    listenerRef.current?.();
    dispatch({ type: 'SET_EDITING_EXISTING', value: false });
    dispatch({ type: 'SET_VIEW', view: isEditing ? 'stats' : 'home' });
  }

  // 表示順は名簿(Group.members)順に固定する。partyState.members の順序はデータの出どころで
  // 揺れる（新規=名簿順 / Firestoreマップ読取=id順）ため、表示直前にここで一元的に整列する。
  const orderedParty = { ...partyState, members: orderByRoster(partyState.members, state.groupInfo?.members ?? []) };

  const tabs = [
    { id: 'members' as const, label: '🍻 メンバー' },
    { id: 'split' as const, label: '💰 割り勘' },
    { id: 'summary' as const, label: '✨ 要約' },
  ];

  return (
      <div className="view">
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
          <div style={{ flex: 1 }}>
            <button
              onClick={handleEndParty}
              className="btn btn-sm text-accent"
              style={{ width: '100%', fontWeight: 'bold' }}
            >
              保存
            </button>
          </div>
          <div style={{ flex: 2, textAlign: 'center' }}>
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{isEditing ? '履歴を編集' : '飲み会中'}</h2>
            {!isEditing && partyState.id && (
              <span className="sync-badge" style={{ marginTop: '0.15rem' }}>
                <span className="sticker-dot" />リアルタイム同期
              </span>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <button onClick={handleCancel} className="btn btn-sm" style={{ width: '100%' }}>戻る</button>
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

        <div className="party-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => dispatch({ type: 'SET_PARTY_TAB', tab: tab.id })}
              className={activePartyTab === tab.id ? 'on' : undefined}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {activePartyTab === 'members' && <MembersTab partyState={orderedParty} onUpdate={updatePartyState} />}
          {activePartyTab === 'split' && <SplitTab partyState={orderedParty} onUpdate={updatePartyState} />}
          {activePartyTab === 'summary' && <SummaryTab partyState={orderedParty} onUpdate={updatePartyState} />}
        </div>
      </div>
  );
}
