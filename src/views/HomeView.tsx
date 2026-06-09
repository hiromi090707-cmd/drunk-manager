import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { auth } from '../firebase';
import { cleanup, leaveGroup, updateInviteCode } from '../lib/db';
import { logout } from '../lib/auth';
import { createNewParty, rosterOf, findActiveParty, buildEditPartyState } from '../lib/party';
import { BrandLogo } from '../components/BrandLogo';
import { OnboardingOverlay } from '../components/OnboardingOverlay';
import { hasSeenOnboarding, markOnboardingSeen } from '../lib/onboarding';

export function HomeView() {
  const { state, dispatch } = useApp();
  const user = auth.currentUser;

  const [showOnboarding, setShowOnboarding] = useState(() => !hasSeenOnboarding());
  const [editingCode, setEditingCode] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSaveCode() {
    setSaving(true);
    try {
      const updated = await updateInviteCode(codeInput);
      dispatch({ type: 'SET_GROUP', group: { ...state.groupInfo!, inviteCode: updated } });
      setEditingCode(false);
      alert(`招待コードを「${updated}」に変更しました。`);
    } catch (e) {
      alert(e instanceof Error ? e.message : '変更に失敗しました。');
    } finally {
      setSaving(false);
    }
  }

  async function handleNewParty() {
    const active = findActiveParty(state.historyData);
    if (active) {
      // 進行中の飲み会にそのまま参加（新規作成しない＝乱立防止）
      dispatch({ type: 'SET_PARTY_STATE', party: buildEditPartyState(active) });
      dispatch({ type: 'SET_PARTY_TAB', tab: 'members' });
      dispatch({ type: 'SET_VIEW', view: 'party' });
      return;
    }
    try {
      const newParty = await createNewParty(rosterOf(state.groupInfo));
      dispatch({ type: 'SET_PARTY_STATE', party: newParty });
      dispatch({ type: 'SET_PARTY_TAB', tab: 'members' });
      dispatch({ type: 'SET_VIEW', view: 'party' });
    } catch {
      alert('飲み会の開始に失敗しました。ネットワーク接続を確認してください。');
    }
  }

  async function handleLeaveGroup() {
    if (!confirm('このグループを退出しますか？\n退出後は招待コードで再参加できます。')) return;
    const user = auth.currentUser;
    if (!user) return;
    if (!user.email) {
      alert('メールアドレスが取得できませんでした。再ログインしてください。');
      return;
    }
    try {
      cleanup();
      await leaveGroup(user.uid, user.email);
      dispatch({ type: 'SET_GROUP', group: null });
      dispatch({ type: 'SET_HISTORY', parties: [] });
      dispatch({ type: 'SET_VIEW', view: 'groupSetup' });
    } catch {
      alert('退出に失敗しました。');
    }
  }

  async function handleLogout() {
    if (!confirm('ログアウトしますか？')) return;
    cleanup();
    await logout();
  }

  function handleCloseOnboarding() {
    markOnboardingSeen();
    setShowOnboarding(false);
  }

  const activeParty = findActiveParty(state.historyData);

  return (
    <div className="view" id="view-home">
      {showOnboarding && <OnboardingOverlay onClose={handleCloseOnboarding} />}
      <div className="mt-4 mb-4">
        <BrandLogo size="lg" lantern subtitle="のみかい マネージャー" />
      </div>

      <div className="mt-6">
        {activeParty && (
          <div className="text-center" style={{ marginBottom: '0.6rem' }}>
            <span className="sticker"><span className="sticker-dot" />進行中の飲み会があります</span>
          </div>
        )}
        <button onClick={handleNewParty} className="btn-3d">
          <div>
            <div className="btn-3d-title">{activeParty ? '飲み会に参加' : '飲み会スタート'}</div>
            <div className="btn-3d-sub">
              {activeParty ? 'みんなが編集中の記録にそのまま合流' : 'いつものメンバーで新しい記録を始めます'}
            </div>
          </div>
          <span className="btn-3d-ic">🍺</span>
        </button>
      </div>

      <div className="sec-divider"><span>記録をふりかえる</span><div className="sec-line" /></div>
      <button
        onClick={() => { dispatch({ type: 'SET_STATS_DATE', date: new Date() }); dispatch({ type: 'SET_VIEW', view: 'stats' }); }}
        className="btn-3d btn-3d-dark"
      >
        <div>
          <div className="btn-3d-title" style={{ fontSize: '1.1rem' }}>データと集計を見る</div>
          <div className="btn-3d-sub">これまで {state.historyData.length} 回の記録</div>
        </div>
        <span className="btn-3d-ic">📊</span>
      </button>

      <div className="sec-divider"><span>この席のあなた</span><div className="sec-line" /></div>
      <div className="glass p-3" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {user?.photoURL && <img src={user.photoURL} style={{ width: 28, height: 28, borderRadius: '50%' }} />}
          <span className="text-muted" style={{ fontSize: '0.8rem' }}>{user?.displayName ?? ''}</span>
        </div>
        <button
          onClick={handleLogout}
          className="btn btn-sm"
          style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', background: 'transparent', border: '1px solid var(--border-color)' }}
        >
          ログアウト
        </button>
      </div>

      {state.groupInfo?.inviteCode && (
        <div className="glass p-3 mt-4">
          <p className="text-muted" style={{ fontSize: '0.7rem', marginBottom: '0.2rem' }}>招待コード</p>
          {editingCode ? (
            <div className="flex" style={{ gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="text"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                className="input-field text-accent"
                style={{ flex: 1, minWidth: 0, letterSpacing: '0.2rem', fontWeight: 'bold', textTransform: 'uppercase' }}
                maxLength={16}
                autoFocus
              />
              <button onClick={handleSaveCode} disabled={saving} className="btn btn-sm text-accent" style={{ fontWeight: 'bold' }}>{saving ? '保存中…' : '保存'}</button>
              <button onClick={() => setEditingCode(false)} disabled={saving} className="btn btn-sm btn-ghost text-muted">取消</button>
            </div>
          ) : (
            <div className="flex justify-between items-center">
              <span className="text-accent" style={{ letterSpacing: '0.2rem', fontWeight: 'bold' }}>
                {state.groupInfo.inviteCode}
              </span>
              <button
                onClick={() => { setCodeInput(state.groupInfo!.inviteCode); setEditingCode(true); }}
                className="btn btn-sm btn-ghost text-muted"
                style={{ fontSize: '0.75rem' }}
              >
                変更
              </button>
            </div>
          )}
          <button
            onClick={handleLeaveGroup}
            className="btn btn-sm mt-3 w-full"
            style={{ fontSize: '0.8rem', color: 'var(--danger-color)', background: 'transparent', border: '1px solid var(--danger-color)' }}
          >
            このグループを退出する
          </button>
        </div>
      )}
    </div>
  );
}
