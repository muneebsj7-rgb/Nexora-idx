import { UserProfile } from '../types';

const STORAGE_KEY_USER = 'nexora_user_session';
const STORAGE_KEY_USERS_DB = 'nexora_registered_users';

export interface AuthState {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isFirebaseActive: boolean;
  statusMessage?: string;
}

const DEFAULT_USER: UserProfile = {
  id: 'usr_829104',
  email: 'miner.alex@nexoramine.io',
  displayName: 'Alex Thorne',
  isEmailVerified: true,
  kycTier: 'Tier 1 (Basic)',
  createdAt: '2025-01-15T10:30:00.000Z',
  avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  referralCode: 'NEXO-9842',
  twoFactorEnabled: false,
  currency: 'USD',
};

export class AuthService {
  private static currentUser: UserProfile | null = null;

  static initialize(): UserProfile {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_USER);
      if (saved) {
        this.currentUser = JSON.parse(saved);
        return this.currentUser!;
      }
    } catch {
      // ignore
    }
    this.currentUser = DEFAULT_USER;
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(DEFAULT_USER));
    return DEFAULT_USER;
  }

  static getCurrentUser(): UserProfile | null {
    if (!this.currentUser) {
      return this.initialize();
    }
    return this.currentUser;
  }

  static async login(email: string, pass: string): Promise<UserProfile> {
    await new Promise((r) => setTimeout(r, 600));

    if (!email || !pass) {
      throw new Error('Please enter both email and password.');
    }

    if (pass.length < 6) {
      throw new Error('Password must be at least 6 characters.');
    }

    // Check registered accounts or fallback
    let usersDb: Record<string, UserProfile> = {};
    try {
      usersDb = JSON.parse(localStorage.getItem(STORAGE_KEY_USERS_DB) || '{}');
    } catch {
      usersDb = {};
    }

    let user = usersDb[email.toLowerCase()];
    if (!user) {
      // Create profile for this session
      user = {
        id: 'usr_' + Math.floor(100000 + Math.random() * 900000),
        email: email.toLowerCase(),
        displayName: email.split('@')[0],
        isEmailVerified: false,
        kycTier: 'None',
        createdAt: new Date().toISOString(),
        referralCode: 'NEXO-' + Math.floor(1000 + Math.random() * 9000),
        twoFactorEnabled: false,
        currency: 'USD',
      };
      usersDb[email.toLowerCase()] = user;
      localStorage.setItem(STORAGE_KEY_USERS_DB, JSON.stringify(usersDb));
    }

    this.currentUser = user;
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
    return user;
  }

  static async register(email: string, pass: string, displayName?: string, refCode?: string): Promise<UserProfile> {
    await new Promise((r) => setTimeout(r, 700));

    if (!email || !email.includes('@')) {
      throw new Error('Please enter a valid email address.');
    }
    if (!pass || pass.length < 6) {
      throw new Error('Password must be at least 6 characters.');
    }

    let usersDb: Record<string, UserProfile> = {};
    try {
      usersDb = JSON.parse(localStorage.getItem(STORAGE_KEY_USERS_DB) || '{}');
    } catch {
      usersDb = {};
    }

    if (usersDb[email.toLowerCase()]) {
      throw new Error('An account with this email already exists. Please log in.');
    }

    const newUser: UserProfile = {
      id: 'usr_' + Math.floor(100000 + Math.random() * 900000),
      email: email.toLowerCase(),
      displayName: displayName?.trim() || email.split('@')[0],
      isEmailVerified: false,
      kycTier: 'None',
      createdAt: new Date().toISOString(),
      referralCode: 'NEXO-' + Math.floor(1000 + Math.random() * 9000),
      referredBy: refCode?.trim() || undefined,
      twoFactorEnabled: false,
      currency: 'USD',
    };

    usersDb[email.toLowerCase()] = newUser;
    localStorage.setItem(STORAGE_KEY_USERS_DB, JSON.stringify(usersDb));
    this.currentUser = newUser;
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(newUser));
    return newUser;
  }

  static async logout(): Promise<void> {
    await new Promise((r) => setTimeout(r, 300));
    this.currentUser = null;
    localStorage.removeItem(STORAGE_KEY_USER);
  }

  static async sendPasswordReset(email: string): Promise<string> {
    await new Promise((r) => setTimeout(r, 600));
    if (!email || !email.includes('@')) {
      throw new Error('Please provide a valid email address.');
    }
    return `Password reset instructions have been dispatched to ${email}. Please check your inbox and spam folder.`;
  }

  static async triggerEmailVerification(email: string): Promise<string> {
    await new Promise((r) => setTimeout(r, 500));
    return `A fresh verification link was sent to ${email}. Click the link to complete verification.`;
  }

  static updateUser(updates: Partial<UserProfile>): UserProfile {
    if (!this.currentUser) {
      this.currentUser = DEFAULT_USER;
    }
    this.currentUser = { ...this.currentUser, ...updates };
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(this.currentUser));
    return this.currentUser;
  }
}
