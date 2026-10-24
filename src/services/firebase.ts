import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
  setLogLevel,
  Firestore,
} from 'firebase/firestore';

export interface FirebaseConfig {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  firestoreDatabaseId?: string;
}

const sanitizeEnvValue = (raw: unknown): string | undefined => {
  if (typeof raw !== 'string') {
    return undefined;
  }
  const cleaned = raw.trim().replace(/^["']+|["']+$/g, '').trim();
  return cleaned.length > 0 ? cleaned : undefined;
};

const getEnv = (key: string): string | undefined => {
  if (typeof import.meta !== 'undefined' && import.meta?.env?.[key]) {
    return sanitizeEnvValue(import.meta.env[key]);
  }
  if (typeof process !== 'undefined' && process?.env?.[key]) {
    return sanitizeEnvValue(process.env[key]);
  }
  return undefined;
};

// Read configuration strictly from standard Vite environment variables
export const firebaseConfig: FirebaseConfig = {
  apiKey: getEnv('VITE_FIREBASE_API_KEY'),
  authDomain: getEnv('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: getEnv('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: getEnv('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: getEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: getEnv('VITE_FIREBASE_APP_ID'),
  firestoreDatabaseId: getEnv('VITE_FIREBASE_DATABASE_ID'),
};

export const isFirebaseConfigured: boolean = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  !firebaseConfig.apiKey.toLowerCase().includes('placeholder') &&
  !firebaseConfig.apiKey.toLowerCase().includes('your_') &&
  !firebaseConfig.apiKey.toLowerCase().includes('my_') &&
  firebaseConfig.projectId !== 'nexora-mine-default' &&
  firebaseConfig.projectId !== 'your-project-id'
);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

try {
  if (isFirebaseConfigured) {
    // Suppress internal @firebase/firestore WebChannel retry console.error spam
    setLogLevel('silent');

    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    auth = getAuth(app);

    const dbId =
      firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
        ? firebaseConfig.firestoreDatabaseId
        : undefined;

    try {
      const localCache =
        typeof window !== 'undefined' && typeof indexedDB !== 'undefined'
          ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
          : memoryLocalCache();

      const firestoreSettings = {
        experimentalForceLongPolling: true,
        localCache,
      };

      db = dbId
        ? initializeFirestore(app, firestoreSettings, dbId)
        : initializeFirestore(app, firestoreSettings);
    } catch {
      db = dbId ? getFirestore(app, dbId) : getFirestore(app);
    }
  }
} catch (error) {
  console.warn('Firebase initialization note:', error);
}

export { app, auth, db };
