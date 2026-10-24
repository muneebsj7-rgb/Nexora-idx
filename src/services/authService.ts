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
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { UserProfile } from '../types';
import { auth, db, isFirebaseConfigured } from './firebase';

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
          return new Error(error.message);
        }
    }
  }
  if (error instanceof Error) {
    return error;
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
   */
  static initialize(): UserProfile | null {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_USER);
      if (saved) {
        this.currentUser = JSON.parse(saved);
        return this.currentUser;
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
   * Ensures that the authenticated user has a real document in Cloud Firestore at users/{uid}.
   * If the document does not exist (e.g. initial registration or prior failure), creates it.
   * If it already exists, returns the persisted profile and syncs email verification if updated.
   * NEVER silently swallows Firestore errors.
   */
  static async ensureUserProfileDocument(
    fbUser: FirebaseUser,
    extra?: { displayName?: string; referredBy?: string }
  ): Promise<UserProfile> {
    if (!db) {
      throw new Error(
        'Cloud Firestore is not initialized. Please verify your VITE_FIREBASE_* environment configuration.'
      );
    }

    const fallbackCode = `NEXO-${fbUser.uid.substring(0, 4).toUpperCase()}`;
    const cleanName =
      extra?.displayName?.trim() ||
      fbUser.displayName ||
      (fbUser.email ? fbUser.email.split('@')[0] : 'Miner');

    const userDocRef = doc(db, 'users', fbUser.uid);
    let userDocSnap;
    try {
      userDocSnap = await getDoc(userDocRef);
    } catch (readError) {
      console.error(`Error reading Firestore document users/${fbUser.uid}:`, readError);
      throw formatFirebaseError(readError);
    }

    if (!userDocSnap.exists()) {
      // Document does not exist in Cloud Firestore — create users/{uid} now
      const initialProfile: UserProfile = {
        id: fbUser.uid,
        email: fbUser.email || '',
        displayName: cleanName,
        isEmailVerified: fbUser.emailVerified,
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
        console.error(`Failed to create Firestore profile users/${fbUser.uid}:`, writeError);
        throw formatFirebaseError(writeError);
      }
    }

    // Document exists — hydrate profile and sync verified email if status changed in Auth
    const firestoreData = userDocSnap.data() as Partial<UserProfile>;

    if (fbUser.emailVerified && !firestoreData.isEmailVerified) {
      try {
        await setDoc(
          userDocRef,
          {
            isEmailVerified: true,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        firestoreData.isEmailVerified = true;
      } catch (syncErr) {
        console.warn('Could not sync verified email status to Firestore:', syncErr);
      }
    }

    const hydratedProfile: UserProfile = {
      id: fbUser.uid,
      email: fbUser.email || firestoreData.email || '',
      displayName: firestoreData.displayName || fbUser.displayName || cleanName,
      isEmailVerified: fbUser.emailVerified || Boolean(firestoreData.isEmailVerified),
      kycTier: firestoreData.kycTier || 'None',
      createdAt: firestoreData.createdAt || fbUser.metadata.creationTime || new Date().toISOString(),
      avatarUrl: firestoreData.avatarUrl || fbUser.photoURL || undefined,
      referralCode: firestoreData.referralCode || fallbackCode,
      referredBy: firestoreData.referredBy,
      twoFactorEnabled: firestoreData.twoFactorEnabled ?? false,
      currency: firestoreData.currency || 'USD',
      accentTheme: firestoreData.accentTheme || 'emerald',
      isDemo: false,
      authProvider: 'firebase',
    };

    return hydratedProfile;
  }

  /**
   * Convert a FirebaseUser and Firestore document into an authentic UserProfile
   */
  private static async buildProfileFromFirebase(fbUser: FirebaseUser): Promise<UserProfile> {
    try {
      return await this.ensureUserProfileDocument(fbUser);
    } catch (err) {
      console.warn('Fallback to in-memory profile representation:', err);
      const fallbackCode = `NEXO-${fbUser.uid.substring(0, 4).toUpperCase()}`;
      return {
        id: fbUser.uid,
        email: fbUser.email || '',
        displayName: fbUser.displayName || (fbUser.email ? fbUser.email.split('@')[0] : 'Miner'),
        isEmailVerified: fbUser.emailVerified,
        kycTier: 'None',
        createdAt: fbUser.metadata.creationTime || new Date().toISOString(),
        avatarUrl: fbUser.photoURL || undefined,
        referralCode: fallbackCode,
        twoFactorEnabled: false,
        currency: 'USD',
        accentTheme: 'emerald',
        isDemo: false,
        authProvider: 'firebase',
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
   * Auth state listener coordinating Firebase Auth and local session
   */
  static onAuthStateChanged(callback: (user: UserProfile | null) => void): () => void {
    this.listeners.push(callback);

    // Initial sync
    const initialUser = this.getCurrentUser() || this.initialize();
    callback(initialUser);

    let fbUnsubscribe: (() => void) | null = null;
    if (auth && isFirebaseConfigured) {
      try {
        fbUnsubscribe = onFirebaseAuthStateChanged(auth, async (fbUser) => {
          if (fbUser) {
            const profile = await this.buildProfileFromFirebase(fbUser);
            this.currentUser = profile;
            localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(profile));
            callback(profile);
          } else {
            // Only clear if the active user was a Firebase user (not maintaining a demo session)
            if (this.currentUser && !this.currentUser.isDemo) {
              this.currentUser = null;
              localStorage.removeItem(STORAGE_KEY_USER);
              callback(null);
            }
          }
        });
      } catch (err) {
        console.warn('Firebase auth state listener setup note:', err);
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
        console.error('Auth state listener error:', err);
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
        console.error('Firebase profile update error:', error);
        throw formatFirebaseError(error);
      }
    }

    this.currentUser = mergedUser;
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(mergedUser));
    this.notifyListeners(this.currentUser);
    return this.currentUser;
  }
}
