// Authentication module
import { auth, provider } from './firebase.js';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';

let currentUser = null;
let authReadyResolver;
export const authReady = new Promise(resolve => { authReadyResolver = resolve; });

// Listen for auth state changes
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  authReadyResolver(user);
  // Dispatch custom event so main.js can react
  window.dispatchEvent(new CustomEvent('auth-changed', { detail: { user } }));
});

export function getUser() {
  return currentUser;
}

export async function loginWithGoogle() {
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error) {
    console.error('Login failed:', error);
    if (error.code === 'auth/popup-blocked') {
      alert('ポップアップがブロックされました。ブラウザの設定でポップアップを許可してください。');
    } else if (error.code === 'auth/popup-closed-by-user') {
      // User closed popup, do nothing
    } else {
      alert('ログインに失敗しました。もう一度お試しください。');
    }
    return null;
  }
}

export async function logout() {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Logout failed:', error);
  }
}
