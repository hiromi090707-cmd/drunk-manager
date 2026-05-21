import { signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, provider, db } from '../firebase';

export async function isUserAllowed(email: string): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, 'config', 'allowedUsers'));
    if (!snap.exists()) return false;
    return ((snap.data().emails as string[]) || []).includes(email);
  } catch {
    return false;
  }
}

export async function loginWithGoogle(): Promise<void> {
  try {
    await signInWithPopup(auth, provider);
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error) {
      const firebaseError = error as { code: string };
      if (firebaseError.code === 'auth/popup-blocked') {
        alert('ポップアップがブロックされました。ブラウザの設定でポップアップを許可してください。');
      } else if (firebaseError.code !== 'auth/popup-closed-by-user') {
        alert('ログインに失敗しました。もう一度お試しください。');
      }
    }
  }
}

export async function logout(): Promise<void> {
  await signOut(auth);
}
