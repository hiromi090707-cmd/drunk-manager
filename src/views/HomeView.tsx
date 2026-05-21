import { useApp } from '../context/AppContext';
import { auth } from '../firebase';
import { createParty, cleanup, leaveGroup } from '../lib/db';
import { logout } from '../lib/auth';
import { FIXED_MEMBERS, SPLIT_ROLES } from '../constants';
import type { PartyState } from '../types';

export function HomeView() {
  const { state, dispatch } = useApp();
  const user = auth.currentUser;

  async function handleNewParty() {
    const roles: Record<string, number> = {};
    FIXED_MEMBERS.forEach((m) => (roles[m.id] = SPLIT_ROLES[1].id));
    const startTime = new Date().toISOString();
    const initialMembers = FIXED_MEMBERS.map((m) => ({
      ...m,
      drinks: { beer: 0, highball: 0, sour: 0, other: 0 },
      totalDrinks: 0,
    }));
    try {
      const partyId = await createParty({ areaName: '', storeName: '', startTime, members: initialMembers, totalAmount: 0, splitRoles: roles });
      const newParty: PartyState = {
        id: partyId, areaName: '', storeName: '', startTime,
        members: initialMembers,
        split: { totalAmount: 0, roles },
        summary: { rawText: '', result: '' },
      };
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
    try {
      cleanup();
      await leaveGroup(user.uid, user.email ?? '');
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
        <h1 style={{ fontSize: '3rem', background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 0 }}>
          Drunk
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>飲み会マネージャー</p>
      </div>

      <div className="glass text-center p-4 mt-8">
        <button
          onClick={handleNewParty}
          className="btn btn-primary w-full p-4"
          style={{ fontSize: '1.25rem', marginBottom: '0.75rem', boxShadow: '0 4px 15px rgba(99, 102, 241, 0.4)' }}
        >
          🍺 飲み会スタート
        </button>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>いつものメンバーで新しい記録を始めます</p>
      </div>

      <div className="glass text-center p-4 mt-4">
        <button
          onClick={() => { dispatch({ type: 'SET_STATS_DATE', date: new Date() }); dispatch({ type: 'SET_VIEW', view: 'stats' }); }}
          className="btn w-full p-3"
          style={{ fontSize: '1.125rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)' }}
        >
          📊 データと集計を見る
        </button>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', fontSize: '0.8rem' }}>
          過去 {state.historyData.length} 回の記録があります
        </p>
      </div>

      <div className="glass p-3 mt-4" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {user?.photoURL && <img src={user.photoURL} style={{ width: 28, height: 28, borderRadius: '50%' }} />}
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{user?.displayName ?? ''}</span>
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
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', marginBottom: '0.2rem' }}>招待コード</p>
          <span style={{ letterSpacing: '0.2rem', fontWeight: 'bold', color: 'var(--accent-color)' }}>
            {state.groupInfo.inviteCode}
          </span>
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
