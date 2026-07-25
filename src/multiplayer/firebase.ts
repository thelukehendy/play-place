import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, signInAnonymously, type Auth } from 'firebase/auth';
import { getDatabase, type Database } from 'firebase/database';

const config = {
  apiKey: String(import.meta.env.VITE_FIREBASE_API_KEY ?? '').trim() || undefined,
  authDomain: String(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '').trim() || undefined,
  databaseURL: String(import.meta.env.VITE_FIREBASE_DATABASE_URL ?? '').trim() || undefined,
  projectId: String(import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '').trim() || undefined,
  storageBucket: String(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? '').trim() || undefined,
  messagingSenderId:
    String(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '').trim() || undefined,
  appId: String(import.meta.env.VITE_FIREBASE_APP_ID ?? '').trim() || undefined,
};

export function isFirebaseConfigured(): boolean {
  return Boolean(config.apiKey && config.databaseURL && config.projectId && config.appId);
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Database | null = null;

export function getFirebase() {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured. Add keys to .env.local — see README.');
  }
  if (!app) {
    app = initializeApp(config);
    auth = getAuth(app);
    db = getDatabase(app);
  }
  return { app, auth: auth!, db: db! };
}

export async function ensureAnonAuth() {
  const { auth } = getFirebase();
  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }
  return auth.currentUser!;
}
