import { useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase';
import { useApp } from './context/AppContext';
import { isUserAllowed } from './lib/auth';
import { findUserGroup, listenToParties, migrateLocalData, cleanup } from './lib/db';
import { LoadingView } from './views/LoadingView';
import { LoginView } from './views/LoginView';
import { GroupSetupView } from './views/GroupSetupView';
import { HomeView } from './views/HomeView';
import { PartyView } from './views/PartyView';
import { StatsView } from './views/StatsView';
import { ShareChoiceView } from './views/ShareChoiceView';

export function App() {
  const { state, dispatch } = useApp();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        cleanup();
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

          listenToParties((parties) => {
            dispatch({ type: 'SET_HISTORY', parties });
          });

          const localHistory = JSON.parse(localStorage.getItem('drunk_history') || '[]');
          if (localHistory.length > 0) {
            migrateLocalData()
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

  switch (state.view) {
    case 'loading':     return <LoadingView />;
    case 'login':       return <LoginView />;
    case 'groupSetup':  return <GroupSetupView />;
    case 'home':        return <HomeView />;
    case 'party':       return <PartyView />;
    case 'stats':       return <StatsView />;
    case 'shareChoice': return <ShareChoiceView />;
  }
}
