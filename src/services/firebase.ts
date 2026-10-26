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
export let firestoreCacheMode: 'persistent' | 'memory' | 'default' = 'default';

/**
 * Strictly classifies whether a Firestore error is a genuine transient network / offline
 * condition where a read-only local cache fallback (`getDocFromCache` / `getDocsFromCache`) is permitted.
 *
 * SECURITY INVARIANT:
 * Never returns `true` for `permission-denied`, `unauthenticated`, `invalid-argument`,
 * `failed-precondition`, `not-found`, or any authorization/validation error.
 */
export function isExpectedOfflineError(error: unknown): boolean {
  if (!error) return false;
  const errObj = error as { code?: unknown; message?: unknown };
  const rawCode = typeof errObj.code === 'string' ? errObj.code.toLowerCase().trim() : '';
  const code = rawCode.replace(/^firestore\//, '');
  const message = typeof errObj.message === 'string' ? errObj.message.toLowerCase() : '';

  // Explicitly reject security, auth, and validation errors even if message text is ambiguous
  const nonOfflineCodes = new Set([
    'permission-denied',
    'unauthenticated',
    'invalid-argument',
    'failed-precondition',
    'not-found',
    'already-exists',
    'aborted',
    'out-of-range',
    'unimplemented',
    'data-loss',
  ]);
  if (nonOfflineCodes.has(code)) {
    return false;
  }

  if (
    message.includes('permission') ||
    message.includes('insufficient permissions') ||
    message.includes('unauthenticated') ||
    message.includes('invalid argument')
  ) {
    return false;
  }

  if (code === 'unavailable' || code === 'deadline-exceeded') {
    return true;
  }

  if (
    message.includes('client is offline') ||
    message.includes('could not reach cloud firestore backend') ||
    message.includes('failed to get document because the client is offline') ||
    message.includes('network error')
  ) {
    return true;
  }

  return false;
}

/**
 * Redacts any accidental Bearer tokens, JWTs, or private key fragments from diagnostic messages.
 */
export function sanitizeDiagnosticMessage(rawMessage: unknown): string {
  if (typeof rawMessage !== 'string') return 'Unknown Firestore error';
  return rawMessage
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[REDACTED_JWT]');
}

try {
  if (isFirebaseConfigured) {
    // Use 'error' log level instead of 'silent' so genuine configuration/auth errors remain visible
    // without noisy debug/info transport chatter or token exposure.
    setLogLevel('error');

    const existingApps = getApps();
    app = existingApps.length === 0 ? initializeApp(firebaseConfig) : getApp();
    auth = getAuth(app);

    const dbId =
      firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
        ? firebaseConfig.firestoreDatabaseId
        : undefined;

    const canUseIndexedDb =
      typeof window !== 'undefined' && typeof indexedDB !== 'undefined' && indexedDB !== null;

    if (canUseIndexedDb) {
      try {
        const persistentSettings = {
          experimentalForceLongPolling: true,
          localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
        };
        db = dbId
          ? initializeFirestore(app, persistentSettings, dbId)
          : initializeFirestore(app, persistentSettings);
        firestoreCacheMode = 'persistent';
      } catch (persistErr: unknown) {
        const errMsg = sanitizeDiagnosticMessage((persistErr as any)?.message);
        const alreadyInitialized = errMsg.toLowerCase().includes('already been called');
        if (alreadyInitialized) {
          db = dbId ? getFirestore(app, dbId) : getFirestore(app);
        } else {
          //Genuine IndexedDB / storage restriction (e.g., sandboxed iframe or private browsing):
          //fall back to memoryLocalCache while preserving experimentalForceLongPolling: true
          try {
            const memorySettings = {
              experimentalForceLongPolling: true,
              localCache: memoryLocalCache(),
            };
            db = dbId
              ? initializeFirestore(app, memorySettings, dbId)
              : initializeFirestore(app, memorySettings);
            firestoreCacheMode = 'memory';
          } catch {
            db = dbId ? getFirestore(app, dbId) : getFirestore(app);
          }
        }
      }
    } else {
      try {
        const memorySettings = {
          experimentalForceLongPolling: true,
          localCache: memoryLocalCache(),
        };
        db = dbId
          ? initializeFirestore(app, memorySettings, dbId)
          : initializeFirestore(app, memorySettings);
        firestoreCacheMode = 'memory';
      } catch {
        db = dbId ? getFirestore(app, dbId) : getFirestore(app);
      }
    }
  }
} catch (error: unknown) {
  console.warn('Firebase initialization diagnostic:', sanitizeDiagnosticMessage((error as any)?.message));
}

export { app, auth, db };
