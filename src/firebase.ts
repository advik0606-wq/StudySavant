import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfigImport from '../firebase-applet-config.json';

// Use environment variables if available (for Vercel), otherwise fallback to the applet config
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || firebaseConfigImport.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfigImport.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || firebaseConfigImport.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfigImport.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfigImport.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || firebaseConfigImport.appId,
  databaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID || firebaseConfigImport.firestoreDatabaseId
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.databaseId);

// Auth helpers
let isSigningIn = false;
export const signIn = async () => {
  if (isSigningIn) return;
  isSigningIn = true;
  try {
    const provider = new GoogleAuthProvider();
    // Add custom parameters to help with popup behavior if needed
    provider.setCustomParameters({ prompt: 'select_account' });
    await signInWithPopup(auth, provider);
  } catch (error: any) {
    if (error.code === 'auth/cancelled-popup-request') {
      console.warn('Sign-in popup request was cancelled due to a newer request.');
    } else if (error.code === 'auth/popup-closed-by-user') {
      console.log('Sign-in popup was closed by the user.');
    } else {
      console.error('Sign-in error:', error);
    }
  } finally {
    isSigningIn = false;
  }
};
export const logOut = () => signOut(auth);

export default app;
