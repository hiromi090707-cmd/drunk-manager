import { auth, provider, db } from './firebase.js';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

let currentUser = null;
let authReadyResolver;
export const authReady = new Promise(resolve => { authReadyResolver = resolve; });

async function isUserAllowed(email) {
  try {
    const snap = await getDoc(doc(db, 'config', 'allowedUsers'));
    if (!snap.exists()) return false;
    return (snap.data().emails || []).includes(email);
  } catch {
    return false;
  }
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    const allowed = await isUserAllowed(user.email);
    if (!allowed) {
      alert('このアプリの使用が許可されていません。');
      await signOut(auth);
      return;
    }
  }
  currentUser = user;
  authReadyResolver(user);
  window.dispatchEvent(new CustomEvent('auth-changed', { detail: { user } }));
});

export function getUser() {
  return currentUser;
}

export async function loginWithGoogle() {
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error('Login failed:', error);
    if (error.code === 'auth/popup-blocked') {
      alert('ポップアップがブロックされました。ブラウザの設定でポップアップを許可してください。');
    } else if (error.code !== 'auth/popup-closed-by-user') {
      alert('ログインに失敗しました。もう一度お試しください。');
    }
  }
}

export async function logout() {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Logout failed:', error);
  }
}
