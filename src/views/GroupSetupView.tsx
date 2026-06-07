import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { createGroup, joinGroupByCode, listenToParties } from '../lib/db';
import { logout } from '../lib/auth';
import { auth } from '../firebase';
import { FIXED_MEMBERS } from '../constants';

export function GroupSetupView() {
  const { dispatch } = useApp();
  const [inviteCode, setInviteCode] = useState('');
  const [customCode, setCustomCode] = useState('');

  async function handleCreateGroup() {
    const user = auth.currentUser;
    if (!user) return;
    const code = customCode.trim().toUpperCase();
    if (code && code.length < 2) return alert('招待コードは2文字以上で入力してください。');
    try {
      const group = await createGroup('いつメン', [...FIXED_MEMBERS], user.uid, user.email ?? '', code || undefined);
      dispatch({ type: 'SET_GROUP', group });
      listenToParties((parties) => dispatch({ type: 'SET_HISTORY', parties }));
      alert(`グループを作成しました！\n\n招待コード: ${group.inviteCode}\n\nこのコードを仲間に共有してください。`);
      dispatch({ type: 'SET_VIEW', view: 'home' });
    } catch {
      alert('グループ作成に失敗しました。');
    }
  }

  async function handleJoinGroup() {
    const user = auth.currentUser;
    const code = inviteCode.trim().toUpperCase();
    if (!user || !code) return alert('招待コードを入力してください。');
    if (!user.email) return alert('メールアドレスが取得できませんでした。再ログインしてください。');
    try {
      const group = await joinGroupByCode(code, user.uid, user.email);
      dispatch({ type: 'SET_GROUP', group });
      listenToParties((parties) => dispatch({ type: 'SET_HISTORY', parties }));
      dispatch({ type: 'SET_VIEW', view: 'home' });
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : 'グループへの参加に失敗しました。');
    }
  }

  return (
    <div className="view" style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div className="text-center mb-4">
        <h1 style={{ fontSize: '2rem', background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          グループ設定
        </h1>
        <p className="text-muted">グループを作成するか、招待コードで参加してください</p>
      </div>

      <div className="glass p-4 mb-4" style={{ width: '100%', maxWidth: 320 }}>
        <h3 className="text-center mb-3" style={{ fontSize: '1rem' }}>🍺 新しく作る</h3>
        <input
          type="text"
          value={customCode}
          onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
          className="input-field w-full mb-3 text-center"
          style={{ textTransform: 'uppercase', letterSpacing: '0.2rem', fontSize: '1.1rem' }}
          placeholder="招待コード（省略可）"
          maxLength={16}
        />
        <p className="text-muted" style={{ fontSize: '0.75rem', textAlign: 'center', marginBottom: '0.75rem' }}>
          空欄の場合は自動生成されます
        </p>
        <button onClick={handleCreateGroup} className="btn btn-primary w-full p-3">
          グループを作成
        </button>
      </div>

      <div className="glass p-4" style={{ width: '100%', maxWidth: 320 }}>
        <h3 className="text-center mb-3" style={{ fontSize: '1rem' }}>🤝 参加する</h3>
        <input
          type="text"
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
          className="input-field w-full mb-3 text-center"
          style={{ textTransform: 'uppercase', letterSpacing: '0.3rem', fontSize: '1.2rem' }}
          placeholder="招待コード"
          maxLength={16}
        />
        <button
          onClick={handleJoinGroup}
          className="btn w-full p-3"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)' }}
        >
          参加する
        </button>
      </div>

      <button
        onClick={logout}
        className="btn btn-sm mt-4 btn-ghost text-muted"
      >
        ログアウト
      </button>
    </div>
  );
}
