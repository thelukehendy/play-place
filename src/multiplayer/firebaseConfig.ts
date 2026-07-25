/**
 * Public Firebase web config for Play Place.
 * Client API keys are expected to be public; Realtime Database rules protect data.
 * Env vars (VITE_FIREBASE_*) override these when present (local .env.local / CI).
 */
export const FIREBASE_WEB_CONFIG = {
  apiKey: 'AIzaSyC2RaGZPpSyXr107_t67qvp9N1bpYwutvg',
  authDomain: 'play-place-78df8.firebaseapp.com',
  databaseURL: 'https://play-place-78df8-default-rtdb.firebaseio.com',
  projectId: 'play-place-78df8',
  storageBucket: 'play-place-78df8.firebasestorage.app',
  messagingSenderId: '253265509885',
  appId: '1:253265509885:web:3fd72b276151ee525e2d94',
} as const;
