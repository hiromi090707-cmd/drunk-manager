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
      <div className="mt-6 mb-5">
        <BrandLogo size="lg" lantern subtitle="のみかい マネージャー" />
      </div>

      <div className="mt-6">
        {activeParty && (
          <div className="text-center" style={{ marginBottom: '0.9rem' }}>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10, overflow: 'hidden',
            border: '2px solid var(--outline)', background: 'var(--accent-gradient)',
            display: 'grid', placeItems: 'center', fontFamily: 'var(--font-display)', color: '#3a1402', fontSize: '1rem',
          }}>
            {user?.photoURL
              ? <img src={user.photoURL} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : (user?.displayName ?? '?').charAt(0)}
          </div>
          <span className="text-muted" style={{ fontSize: '0.85rem', fontWeight: 700 }}>{user?.displayName ?? ''}</span>
        </div>
        <button
          onClick={handleLogout}
          className="btn btn-sm"
          style={{ fontFamily: 'var(--font-pop)', fontSize: '0.74rem', padding: '0.4rem 0.85rem', background: 'transparent', boxShadow: 'none' }}
        >
          ログアウト
        </button>
      </div>

      {state.groupInfo?.inviteCode && (
        <div className="mt-4" style={{ border: '2px dashed var(--border-strong)', borderRadius: 16, padding: '14px 16px', background: 'rgba(255, 180, 61, 0.05)' }}>
          <p style={{ fontFamily: 'var(--font-pop)', color: 'var(--text-faint)', fontSize: '0.66rem', letterSpacing: '0.16em', marginBottom: '0.3rem' }}>招待コード</p>
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
              <span style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-color)', letterSpacing: '0.16em', fontSize: '1.2rem', WebkitTextStroke: '1px var(--outline)' }}>
                {state.groupInfo.inviteCode}
              </span>
              <button
                onClick={() => { setCodeInput(state.groupInfo!.inviteCode); setEditingCode(true); }}
                className="btn btn-sm"
                style={{ fontFamily: 'var(--font-pop)', fontSize: '0.72rem', padding: '0.4rem 0.85rem', background: 'transparent', boxShadow: 'none', color: 'var(--accent-color)' }}
              >
                変更
              </button>
            </div>
          )}
          <button
            onClick={handleLeaveGroup}
            className="btn btn-sm mt-3 w-full"
            style={{ fontSize: '0.8rem', fontFamily: 'var(--font-pop)', color: 'var(--danger-color)', background: 'transparent', border: '2px solid var(--danger-color)', boxShadow: 'none' }}
          >
            このグループを退出する
          </button>
        </div>
      )}
    </div>
  );
}
