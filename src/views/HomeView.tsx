import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { auth } from '../firebase';
import { cleanup, leaveGroup, updateInviteCode } from '../lib/db';
import { logout } from '../lib/auth';
import { createNewParty, rosterOf } from '../lib/party';

export function HomeView() {
  const { state, dispatch } = useApp();
  const user = auth.currentUser;

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

  return (
    <div className="view" id="view-home">
      <div className="text-center mt-4 mb-4">
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: '5rem',
          background: 'var(--accent-gradient)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          lineHeight: 1,
          filter: 'drop-shadow(0 0 24px rgba(232, 137, 10, 0.35))',
          marginBottom: '0.4rem',
        }}>
          Drunk
        </h1>
        <p className="text-muted" style={{ fontSize: '0.8rem', letterSpacing: '0.2em' }}>飲 み 会 マ ネ ー ジ ャ ー</p>
      </div>

      <div className="glass text-center p-4 mt-8">
        <button
          onClick={handleNewParty}
          className="btn btn-primary w-full p-4"
          style={{ fontSize: '1.25rem', marginBottom: '0.75rem', boxShadow: '0 4px 15px rgba(99, 102, 241, 0.4)' }}
        >
          🍺 飲み会スタート
        </button>
        <p className="text-muted" style={{ fontSize: '0.8rem' }}>いつものメンバーで新しい記録を始めます</p>
      </div>

      <div className="glass text-center p-4 mt-4">
        <button
          onClick={() => { dispatch({ type: 'SET_STATS_DATE', date: new Date() }); dispatch({ type: 'SET_VIEW', view: 'stats' }); }}
          className="btn w-full p-3"
          style={{ fontSize: '1.125rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)' }}
        >
          📊 データと集計を見る
        </button>
        <p className="text-muted" style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>
          過去 {state.historyData.length} 回の記録があります
        </p>
      </div>

      <div className="glass p-3 mt-4" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
