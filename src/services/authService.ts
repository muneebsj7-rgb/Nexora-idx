import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  onAuthStateChanged as onFirebaseAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  getDocFromCache,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { UserProfile } from '../types';
import { auth, db, isFirebaseConfigured, isExpectedOfflineError, sanitizeDiagnosticMessage } from './firebase';

const STORAGE_KEY_USER = 'nexora_user_session';

export interface AuthState {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isFirebaseActive: boolean;
  statusMessage?: string;
}

export const DEFAULT_DEMO_USER: UserProfile = {
  id: 'usr_demo_829104',
  email: 'miner.alex@nexoramine.io',
  displayName: 'Alex Thorne (Demo)',
  isEmailVerified: false,
  kycTier: 'Tier 1 (Basic)',
  createdAt: '2025-01-15T10:30:00.000Z',
  avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  referralCode: 'NEXO-DEMO',
  twoFactorEnabled: false,
  currency: 'USD',
  isDemo: true,
  authProvider: 'demo',
};

function formatFirebaseError(error: unknown): Error {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code: string }).code;
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/user-not-found':
      case 'auth/wrong-password':
        return new Error('Invalid email or password. Please verify your credentials.');
      case 'auth/email-already-in-use':
        return new Error('An account with this email already exists. Please log in instead.');
      case 'auth/weak-password':
        return new Error('Password should be at least 6 characters.');
      case 'auth/invalid-email':
        return new Error('Please enter a valid email address.');
      case 'auth/too-many-requests':
        return new Error('Too many unsuccessful attempts. Please wait a moment and try again.');
      case 'auth/network-request-failed':
        return new Error('Network error. Please check your internet connection.');
      case 'auth/requires-recent-login':
        return new Error('This action requires a recent authentication. Please sign in again.');
      case 'permission-denied':
        return new Error(
          'Cloud Firestore Permission Denied: Unable to write or access user profile in "users" collection. ' +
          'Please ensure that firestore.rules from the project have been published in your Firebase Console.'
        );
      case 'unavailable':
        return new Error('Cloud Firestore service is temporarily unavailable. Please retry in a moment.');
      default:
        if ('message' in error && typeof error.message === 'string') {
          return new Error(sanitizeDiagnosticMessage(error.message));
        }
    }
  }
  if (error instanceof Error) {
    return new Error(sanitizeDiagnosticMessage(error.message));
  }
  return new Error('An unexpected authentication error occurred.');
}

export class AuthService {
  private static currentUser: UserProfile | null = null;
  private static listeners: Array<(user: UserProfile | null) => void> = [];

  /**
   * Check whether Firebase is genuinely configured with valid project credentials.
   */
  static isFirebaseEnabled(): boolean {
    return isFirebaseConfigured && auth !== null;
  }

  /**
   * Initializes session from localStorage if available.
   * Security note: Cached non-demo profiles in localStorage are never trusted for `isAdmin`
   * or `isEmailVerified` elevation and are reconciled against live Firebase Auth state.
   */
  static initialize(): UserProfile | null {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_USER);
      if (saved) {
        const parsed = JSON.parse(saved) as UserProfile;
        if (parsed && typeof parsed.id === 'string') {
          // Never trust a cached isAdmin flag from localStorage
          const sanitized: UserProfile = {
            ...parsed,
            isAdmin: false,
          };
          this.currentUser = sanitized;
          return this.currentUser;
        }
      }
    } catch {
      // ignore parse error
    }
    return null;
  }

  static getCurrentUser(): UserProfile | null {
    return this.currentUser;
  }

  /**
   * Clears any cached user profile state from memory and localStorage.
   */
  static clearCachedSession(): void {
    this.currentUser = null;
    try {
      localStorage.removeItem(STORAGE_KEY_USER);
    } catch {
      // ignore storage errors
    }
  }

  private static pendingProfilePromises = new Map<string, Promise<UserProfile>>();

  /**
   * Ensures that the authenticated user has a real document in Cloud Firestore at users/{uid}.
   * Deduplicates concurrent calls per UID (e.g. login/register racing with onAuthStateChanged)
   * so two concurrent calls never race on initial document creation.
   */
  static async ensureUserProfileDocument(
    fbUser: FirebaseUser,
    extra?: { displayName?: string; referredBy?: string }
  ): Promise<UserProfile> {
    const existingInFlight = this.pendingProfilePromises.get(fbUser.uid);
    if (existingInFlight && !extra?.displayName && !extra?.referredBy) {
      return existingInFlight;
    }

    const runEnsure = async (): Promise<UserProfile> => {
      if (existingInFlight) {
        try {
          await existingInFlight;
        } catch {
          // Proceed with fresh attempt if prior in-flight failed
        }
      }

      if (!db) {
        throw new Error(
          'Cloud Firestore is not initialized. Please verify your VITE_FIREBASE_* environment configuration.'
        );
      }

      const fallbackCode = `NEXO-${fbUser.uid.substring(0, 4).toUpperCase()}`;
      const cleanName = (
        extra?.displayName?.trim() ||
        fbUser.displayName ||
        (fbUser.email ? fbUser.email.split('@')[0] : 'Miner')
      ).slice(0, 80);

      const userDocRef = doc(db, 'users', fbUser.uid);
      let userDocSnap;
      try {
        userDocSnap = await getDoc(userDocRef);
      } catch (readError) {
        if (isExpectedOfflineError(readError)) {
          try {
            userDocSnap = await getDocFromCache(userDocRef);
          } catch {
            const cachedSession =
              this.currentUser && !this.currentUser.isDemo && this.currentUser.id === fbUser.uid
                ? this.currentUser
                : null;
            const offlineProfile: UserProfile = {
              id: fbUser.uid,
              email: fbUser.email || cachedSession?.email || '',
              displayName: cachedSession?.displayName || cleanName,
              isEmailVerified: Boolean(fbUser.emailVerified),
              kycTier: cachedSession?.kycTier || 'None',
              createdAt: cachedSession?.createdAt || fbUser.metadata.creationTime || new Date().toISOString(),
              avatarUrl: cachedSession?.avatarUrl || fbUser.photoURL || undefined,
              referralCode: cachedSession?.referralCode || fallbackCode,
              referredBy: extra?.referredBy?.trim() || cachedSession?.referredBy,
              twoFactorEnabled: cachedSession?.twoFactorEnabled ?? false,
              currency: cachedSession?.currency || 'USD',
              accentTheme: cachedSession?.accentTheme || 'emerald',
              isDemo: false,
              authProvider: 'firebase',
              isAdmin: false,
            };
            return offlineProfile;
          }
        } else {
          console.warn(
            `Firestore read error for users/${fbUser.uid}:`,
            sanitizeDiagnosticMessage((readError as any)?.message)
          );
          throw formatFirebaseError(readError);
        }
      }

      if (!userDocSnap.exists()) {
        // Document does not exist in Cloud Firestore — create users/{uid} now
        const initialProfile: UserProfile = {
          id: fbUser.uid,
          email: fbUser.email || '',
          displayName: cleanName,
          isEmailVerified: Boolean(fbUser.emailVerified),
          kycTier: 'None',
          createdAt: fbUser.metadata.creationTime || new Date().toISOString(),
          avatarUrl: fbUser.photoURL || undefined,
          referralCode: fallbackCode,
          referredBy: extra?.referredBy?.trim() || undefined,
          twoFactorEnabled: false,
          currency: 'USD',
          accentTheme: 'emerald',
          isDemo: false,
          authProvider: 'firebase',
          isAdmin: false,
        };

        try {
          await setDoc(userDocRef, {
            id: initialProfile.id,
            email: initialProfile.email,
            displayName: initialProfile.displayName,
            isEmailVerified: initialProfile.isEmailVerified,
            kycTier: 'None',
            createdAt: initialProfile.createdAt,
            avatarUrl: initialProfile.avatarUrl || null,
            referralCode: initialProfile.referralCode,
            referredBy: initialProfile.referredBy || null,
            twoFactorEnabled: initialProfile.twoFactorEnabled,
            currency: initialProfile.currency,
            accentTheme: initialProfile.accentTheme,
            updatedAt: serverTimestamp(),
          });
          return initialProfile;
        } catch (writeError) {
          if (isExpectedOfflineError(writeError)) {
            return initialProfile;
          }
          console.warn(
            `Failed to create Firestore profile users/${fbUser.uid}:`,
            sanitizeDiagnosticMessage((writeError as any)?.message)
          );
          throw formatFirebaseError(writeError);
        }
      }

      // Document exists — hydrate profile and sync verified email or explicit displayName override if needed
      const firestoreData = userDocSnap.data() as Partial<UserProfile>;
      const syncPatch: Record<string, any> = {};

      if (fbUser.emailVerified && !firestoreData.isEmailVerified) {
        syncPatch.isEmailVerified = true;
        firestoreData.isEmailVerified = true;
      }
      if (extra?.displayName?.trim() && extra.displayName.trim() !== firestoreData.displayName) {
        syncPatch.displayName = extra.displayName.trim().slice(0, 80);
        firestoreData.displayName = syncPatch.displayName;
      }

      if (Object.keys(syncPatch).length > 0) {
        try {
          await setDoc(
            userDocRef,
            {
              ...syncPatch,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        } catch (syncErr) {
          console.warn(
            'Could not sync profile update to Firestore:',
            sanitizeDiagnosticMessage((syncErr as any)?.message)
          );
        }
      }

      // Security invariant: `isEmailVerified` is governed by live Firebase Auth (`fbUser.emailVerified`),
      // never elevated by a stale cached document, and `isAdmin` is never granted from Firestore profile docs.
      const hydratedProfile: UserProfile = {
        id: fbUser.uid,
        email: fbUser.email || firestoreData.email || '',
        displayName: firestoreData.displayName || fbUser.displayName || cleanName,
        isEmailVerified: Boolean(fbUser.emailVerified),
        kycTier: firestoreData.kycTier || 'None',
        createdAt: firestoreData.createdAt || fbUser.metadata.creationTime || new Date().toISOString(),
        avatarUrl: firestoreData.avatarUrl || fbUser.photoURL || undefined,
        referralCode: firestoreData.referralCode || fallbackCode,
        referredBy: firestoreData.referredBy || undefined,
        twoFactorEnabled: firestoreData.twoFactorEnabled ?? false,
        currency: firestoreData.currency || 'USD',
        accentTheme: firestoreData.accentTheme || 'emerald',
        isDemo: false,
        authProvider: 'firebase',
        isAdmin: false,
      };

      return hydratedProfile;
    };

    const trackedPromise = runEnsure();
    this.pendingProfilePromises.set(fbUser.uid, trackedPromise);
    try {
      return await trackedPromise;
    } finally {
      if (this.pendingProfilePromises.get(fbUser.uid) === trackedPromise) {
        this.pendingProfilePromises.delete(fbUser.uid);
      }
    }
  }

  /**
   * Convert a FirebaseUser and Firestore document into an authentic UserProfile
   */
  private static async buildProfileFromFirebase(fbUser: FirebaseUser): Promise<UserProfile> {
    try {
      return await this.ensureUserProfileDocument(fbUser);
    } catch (err) {
      console.warn(
        'Fallback to Firebase Auth token profile representation:',
        sanitizeDiagnosticMessage((err as any)?.message)
      );
      const fallbackCode = `NEXO-${fbUser.uid.substring(0, 4).toUpperCase()}`;
      return {
        id: fbUser.uid,
        email: fbUser.email || '',
        displayName: fbUser.displayName || (fbUser.email ? fbUser.email.split('@')[0] : 'Miner'),
        isEmailVerified: Boolean(fbUser.emailVerified),
        kycTier: 'None',
        createdAt: fbUser.metadata.creationTime || new Date().toISOString(),
        avatarUrl: fbUser.photoURL || undefined,
        referralCode: fallbackCode,
        twoFactorEnabled: false,
        currency: 'USD',
        accentTheme: 'emerald',
        isDemo: false,
        authProvider: 'firebase',
        isAdmin: false,
      };
    }
  }

  /**
   * Real Firebase Login.
   * If Firebase is not configured, clearly throws an error and does NOT silently pretend
   * a real account was authenticated.
   */
  static async login(email: string, pass: string): Promise<UserProfile> {
    if (!email || !pass) {
      throw new Error('Please enter both email and password.');
    }

    if (this.isFirebaseEnabled() && auth) {
      try {
        await setPersistence(auth, browserLocalPersistence);
        const userCredential = await signInWithEmailAndPassword(auth, email.trim(), pass);
        // Ensure user document exists in Firestore (auto-creates if missing from earlier attempt)
        const profile = await this.ensureUserProfileDocument(userCredential.user);
        this.currentUser = profile;
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(profile));
        this.notifyListeners(profile);
        return profile;
      } catch (error) {
        throw formatFirebaseError(error);
      }
    }

    // When Firebase configuration is missing, fail clearly to prevent mistaken identity
    throw new Error(
      'Firebase Authentication is not configured with active credentials. ' +
      'Please configure VITE_FIREBASE_* variables in your environment, or launch Sandbox Demo Mode to test the interface.'
    );
  }

  /**
   * Real Firebase Registration.
   * Fails explicitly if Firebase is not configured instead of pretending to register.
   */
  static async register(
    email: string,
    pass: string,
    displayName?: string,
    refCode?: string
  ): Promise<UserProfile> {
    if (!email || !email.includes('@')) {
      throw new Error('Please enter a valid email address.');
    }
    if (!pass || pass.length < 6) {
      throw new Error('Password must be at least 6 characters.');
    }

    if (this.isFirebaseEnabled() && auth) {
      try {
        await setPersistence(auth, browserLocalPersistence);
        const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), pass);
        const fbUser = userCredential.user;

        const cleanName = displayName?.trim() || email.split('@')[0];
        try {
          await updateProfile(fbUser, { displayName: cleanName });
        } catch (err) {
          console.warn('Could not set displayName on Firebase Auth user:', err);
        }

        try {
          await sendEmailVerification(fbUser);
        } catch (err) {
          console.warn('Could not send initial verification email:', err);
        }

        // Persist initial document in Cloud Firestore - explicitly throws on failure
        const profile = await this.ensureUserProfileDocument(fbUser, {
          displayName: cleanName,
          referredBy: refCode,
        });

        this.currentUser = profile;
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(profile));
        this.notifyListeners(profile);
        return profile;
      } catch (error) {
        throw formatFirebaseError(error);
      }
    }

    // Do NOT silently pretend account was created in Firebase
    throw new Error(
      'Firebase Authentication is not configured. Account creation requires active Firebase configuration (VITE_FIREBASE_*). ' +
      'To test features immediately without Firebase credentials, enter the Sandbox Demo Mode.'
    );
  }

  /**
   * Explicitly starts a Sandbox / Demo Mode session.
   * Clearly flags isDemo: true so it cannot be mistaken for a real Firebase user.
   */
  static loginAsDemo(): UserProfile {
    const demoProfile: UserProfile = { ...DEFAULT_DEMO_USER };
    this.currentUser = demoProfile;
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(demoProfile));
    this.notifyListeners(demoProfile);
    return demoProfile;
  }

  /**
   * Logout from Firebase Auth and clear session state
   */
  static async logout(): Promise<void> {
    if (this.isFirebaseEnabled() && auth) {
      try {
        await signOut(auth);
      } catch (error) {
        console.warn('Firebase signOut error:', error);
      }
    }

    this.currentUser = null;
    localStorage.removeItem(STORAGE_KEY_USER);
    this.notifyListeners(null);
  }

  /**
   * Password reset instructions via Firebase Auth
   */
  static async sendPasswordReset(email: string): Promise<string> {
    if (!email || !email.includes('@')) {
      throw new Error('Please provide a valid email address.');
    }

    if (this.isFirebaseEnabled() && auth) {
      try {
        await sendPasswordResetEmail(auth, email.trim());
        return `Password reset instructions have been dispatched via Firebase to ${email}. Please check your inbox and spam folder.`;
      } catch (error) {
        throw formatFirebaseError(error);
      }
    }

    throw new Error(
      'Firebase is not configured. Password reset emails cannot be dispatched without active Firebase Authentication.'
    );
  }

  /**
   * Email verification dispatch via Firebase Auth
   */
  static async triggerEmailVerification(email?: string): Promise<string> {
    if (this.isFirebaseEnabled() && auth && auth.currentUser) {
      try {
        await sendEmailVerification(auth.currentUser);
        return `A fresh Firebase verification link was sent to ${auth.currentUser.email}. Click the link to complete verification.`;
      } catch (error) {
        throw formatFirebaseError(error);
      }
    }

    throw new Error(
      'Firebase is not configured. Email verification cannot be dispatched without active Firebase Authentication.'
    );
  }

  /**
   * Auth state listener coordinating Firebase Auth and local session.
   * Security invariant:
   * - Never allows a cached profile from Account A to remain active when Account B signs in or when signed out.
   * - Never trusts localStorage for `isAdmin` or `isEmailVerified` without an active FirebaseUser.
   */
  static onAuthStateChanged(callback: (user: UserProfile | null) => void): () => void {
    this.listeners.push(callback);

    const initialUser = this.getCurrentUser() || this.initialize();
    if (initialUser?.isDemo) {
      callback(initialUser);
    } else if (!isFirebaseConfigured || !auth) {
      callback(null);
    } else {
      // Wait for Firebase Auth state callback to confirm token/session validity before trusting non-demo profile,
      // or emit a provisional non-privileged profile if auth.currentUser already matches.
      if (auth.currentUser && initialUser && initialUser.id === auth.currentUser.uid) {
        callback({
          ...initialUser,
          isEmailVerified: Boolean(auth.currentUser.emailVerified),
          isAdmin: false,
        });
      }
    }

    let fbUnsubscribe: (() => void) | null = null;
    if (auth && isFirebaseConfigured) {
      try {
        fbUnsubscribe = onFirebaseAuthStateChanged(auth, async (fbUser) => {
          if (fbUser) {
            // If switching from another user or demo session, clear previous user's cached session first
            if (this.currentUser && this.currentUser.id !== fbUser.uid) {
              this.clearCachedSession();
            }
            const profile = await this.buildProfileFromFirebase(fbUser);
            this.currentUser = profile;
            try {
              localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(profile));
            } catch {
              // ignore storage errors
            }
            callback(profile);
          } else {
            // Only clear if the active user was a Firebase user (not maintaining an explicit demo session)
            if (!this.currentUser || !this.currentUser.isDemo) {
              this.clearCachedSession();
              callback(null);
            }
          }
        });
      } catch (err) {
        console.warn('Firebase auth state listener setup note:', sanitizeDiagnosticMessage((err as any)?.message));
      }
    }

    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
      if (fbUnsubscribe) {
        fbUnsubscribe();
      }
    };
  }

  private static notifyListeners(user: UserProfile | null) {
    this.listeners.forEach((listener) => {
      try {
        listener(user);
      } catch (err) {
        console.warn('Auth state listener notice:', sanitizeDiagnosticMessage((err as any)?.message));
      }
    });
  }

  /**
   * Update profile using Firebase Authentication and Cloud Firestore where appropriate.
   * Strictly respects protected fields and handles demo sessions vs real Firebase accounts.
   */
  static async updateUser(updates: Partial<UserProfile>): Promise<UserProfile> {
    if (!this.currentUser) {
      this.currentUser = this.getCurrentUser() || this.initialize() || { ...DEFAULT_DEMO_USER };
    }

    // Protect system-governed fields from client manipulation
    const {
      kycTier,
      isEmailVerified,
      isAdmin,
      id,
      createdAt,
      isDemo,
      authProvider,
      ...safeClientUpdates
    } = updates;

    const mergedUser: UserProfile = {
      ...this.currentUser,
      ...safeClientUpdates,
    };

    // If active user is in Demo Mode, save locally and return
    if (this.currentUser.isDemo) {
      this.currentUser = mergedUser;
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(mergedUser));
      this.notifyListeners(this.currentUser);
      return this.currentUser;
    }

    // Live Firebase Authentication & Cloud Firestore update
    if (this.isFirebaseEnabled() && auth && auth.currentUser) {
      try {
        // Update Firebase Auth user profile (displayName, photoURL)
        const authUpdates: { displayName?: string; photoURL?: string } = {};
        if (safeClientUpdates.displayName !== undefined) {
          authUpdates.displayName = safeClientUpdates.displayName;
        }
        if (safeClientUpdates.avatarUrl !== undefined) {
          authUpdates.photoURL = safeClientUpdates.avatarUrl;
        }

        if (Object.keys(authUpdates).length > 0) {
          await updateProfile(auth.currentUser, authUpdates);
        }

        // Update Cloud Firestore user document
        if (!db) {
          throw new Error('Cloud Firestore is not initialized. Please verify Firebase project configuration.');
        }
        const userDocRef = doc(db, 'users', auth.currentUser.uid);
        await setDoc(
          userDocRef,
          {
            ...safeClientUpdates,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (error) {
        if (!isExpectedOfflineError(error)) {
          console.warn('Firebase profile update notice:', sanitizeDiagnosticMessage((error as any)?.message));
          throw formatFirebaseError(error);
        }
      }
    }

    this.currentUser = mergedUser;
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(mergedUser));
    this.notifyListeners(this.currentUser);
    return this.currentUser;
  }
}
