import { useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase';
import { useApp } from './context/AppContext';
import { isUserAllowed } from './lib/auth';
import { findUserGroup, listenToParties, migrateLocalData } from './lib/db';
import { LoadingView } from './views/LoadingView';
import { LoginView } from './views/LoginView';
import { GroupSetupView } from './views/GroupSetupView';
import { HomeView } from './views/HomeView';
import { PartyView } from './views/PartyView';
import { StatsView } from './views/StatsView';
import { ShareChoiceView } from './views/ShareChoiceView';
import { MemberManageView } from './views/MemberManageView';

export function App() {
  const { state, dispatch } = useApp();
  const groupId = state.groupInfo?.id ?? null;

  // 認証状態の監視。責務は「認証確認 → グループ解決 → 画面遷移」のみ（購読はしない）
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        dispatch({ type: 'LOGOUT' });
        return;
      }

      const allowed = await isUserAllowed(user.email ?? '');
      if (!allowed) {
        alert('このアプリの使用が許可されていません。');
        await signOut(auth);
        return;
      }

      try {
        const group = await findUserGroup(user.uid);
        if (group) {
          dispatch({ type: 'SET_GROUP', group });

          const localHistory = JSON.parse(localStorage.getItem('drunk_history') || '[]');
          if (localHistory.length > 0) {
            migrateLocalData(group.id)
              .then((migrated) => {
                if (migrated > 0) alert(`${migrated}件の過去データをクラウドに移行しました！`);
              })
              .catch(console.error);
          }

          dispatch({ type: 'SET_VIEW', view: state.sharedText ? 'shareChoice' : 'home' });
        } else {
          dispatch({ type: 'SET_VIEW', view: 'groupSetup' });
        }
      } catch (err) {
        console.error('グループ情報の取得に失敗:', err);
        dispatch({ type: 'SET_VIEW', view: 'groupSetup' });
      }
    });

    return unsubscribe;
  }, []);

  // 履歴リスナーの唯一の所有者。groupId の変更・null 化（退出/ログアウト/追放）で自動解除される
  useEffect(() => {
    if (!groupId) return;
    return listenToParties(
      groupId,
      (parties) => dispatch({ type: 'SET_HISTORY', parties }),
      (err) => {
        // 購読の恒久停止＝このグループへの所属失効とみなし、グループ選択へ回復する。
        // 意図的な退出中に発火しても handleLeaveGroup と着地点が同じなので冪等
        console.error('履歴リスナーが停止:', err);
        dispatch({ type: 'SET_GROUP', group: null });
        dispatch({ type: 'SET_HISTORY', parties: [] });
        dispatch({ type: 'SET_VIEW', view: 'groupSetup' });
      },
    );
  }, [groupId]);

  switch (state.view) {
    case 'loading':     return <LoadingView />;
    case 'login':       return <LoginView />;
    case 'groupSetup':  return <GroupSetupView />;
    case 'home':        return <HomeView />;
    case 'party':       return <PartyView />;
    case 'stats':       return <StatsView />;
    case 'shareChoice': return <ShareChoiceView />;
    case 'memberManage': return <MemberManageView />;
  }
}
