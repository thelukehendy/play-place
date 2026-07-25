import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, signInAnonymously, type Auth } from 'firebase/auth';
import { getDatabase, type Database } from 'firebase/database';
import { FIREBASE_WEB_CONFIG } from './firebaseConfig';

function envOr(fallback: string, key: string): string {
  const fromEnv = String((import.meta.env as Record<string, string | undefined>)[key] ?? '').trim();
  return fromEnv || fallback;
}

const config = {
  apiKey: envOr(FIREBASE_WEB_CONFIG.apiKey, 'VITE_FIREBASE_API_KEY'),
  authDomain: envOr(FIREBASE_WEB_CONFIG.authDomain, 'VITE_FIREBASE_AUTH_DOMAIN'),
  databaseURL: envOr(FIREBASE_WEB_CONFIG.databaseURL, 'VITE_FIREBASE_DATABASE_URL'),
  projectId: envOr(FIREBASE_WEB_CONFIG.projectId, 'VITE_FIREBASE_PROJECT_ID'),
  storageBucket: envOr(FIREBASE_WEB_CONFIG.storageBucket, 'VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: envOr(
    FIREBASE_WEB_CONFIG.messagingSenderId,
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
  ),
  appId: envOr(FIREBASE_WEB_CONFIG.appId, 'VITE_FIREBASE_APP_ID'),
};

export function isFirebaseConfigured(): boolean {
  return Boolean(config.apiKey && config.databaseURL && config.projectId && config.appId);
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Database | null = null;

export function getFirebase() {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured.');
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
