// Firebase configuration and initialization
// After creating your Firebase project, replace the values below.
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCdBBE-N4sF2cjNvqshsIUyPu5CBjkI2P8",
  authDomain: "drunk-manage.firebaseapp.com",
  projectId: "drunk-manage",
  storageBucket: "drunk-manage.firebasestorage.app",
  messagingSenderId: "655975023773",
  appId: "1:655975023773:web:66b78c7b6e60266dd7c074"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
export const db = getFirestore(app);
