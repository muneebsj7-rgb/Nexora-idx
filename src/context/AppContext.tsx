import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { UserProfile, CryptoMarket, MiningSession, MiningContract, WalletAsset, Transaction, DailyReward, EarnTask, DailyStreakRecord, MarketConnectionStatus } from '../types';
import { AuthService } from '../services/authService';
import { fetchLiveMarketTickers, subscribeMarketTickersWebSocket, SUPPORTED_BINANCE_PAIRS } from '../services/marketService';
import { INITIAL_MINING_SESSION, MINING_PLANS, MiningFirestoreService } from '../services/miningService';
import { INITIAL_WALLET_ASSETS, INITIAL_TRANSACTIONS, WalletFirestoreService } from '../services/walletService';
import { INITIAL_DAILY_REWARDS, INITIAL_EARN_TASKS, DailyRewardsFirestoreService } from '../services/earnService';
import confetti from 'canvas-confetti';

export type NavTab = 'home' | 'mining' | 'markets' | 'wallet' | 'earn' | 'profile';
export type AccentTheme = 'emerald' | 'violet' | 'blue';

export interface ToastMessage {
  id: string;
  title: string;
  message: string;
  type: 'success' | 'info' | 'warning' | 'error';
}

const LOGGED_OUT_MINING_SESSION: MiningSession = {
  ...INITIAL_MINING_SESSION,
  status: 'IDLE',
  hashrateGHs: 0,
  hashrateTHs: 0,
  uptimeSeconds: 0,
  startedAt: null,
  todayEstimatedRewardCoin: 0,
  todayEstimatedRewardUSD: 0,
  confirmedRewardCoin: 0,
  acceptedShares: 0,
  rejectedShares: 0,
  planId: undefined,
  activeContractId: undefined,
  activeContractName: undefined,
  isSimulated: true,
};

interface AppContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  accentTheme: AccentTheme;
  setAccentTheme: (theme: AccentTheme) => void;
  markets: CryptoMarket[];
  isMarketsLive: boolean;
  marketConnectionStatus: MarketConnectionStatus;
  marketError: string | null;
  lastMarketUpdate: Date;
  refreshMarkets: () => Promise<void>;
  miningSession: MiningSession;
  userContracts: MiningContract[];
  isOfflineCache: boolean;
  toggleMining: () => Promise<void>;
  setHardwareProfile: (profile: 'Eco' | 'Balanced' | 'Turbo Overclock') => Promise<void>;
  walletAssets: WalletAsset[];
  transactions: Transaction[];
  dailyRewards: DailyReward[];
  dailyStreakRecord: DailyStreakRecord | null;
  earnTasks: EarnTask[];
  claimDailyReward: (day: number) => Promise<void>;
  claimTaskReward: (taskId: string) => Promise<void> | void;
  submitDepositRequest: (assetSymbol: string, network: string, amount: number, txHash: string) => Promise<{ success: boolean; message: string }>;
  submitWithdrawalRequest: (assetSymbol: string, network: string, amount: number, address: string) => Promise<{ success: boolean; message: string }>;
  refreshWalletState: () => Promise<void>;
  submitPlanOrder: (planIdOrName: string, idempotencyKey?: string) => Promise<{ success: boolean; message: string; contract?: MiningContract }>;
  toasts: ToastMessage[];
  addToast: (title: string, message: string, type?: ToastMessage['type']) => void;
  removeToast: (id: string) => void;
  authModalOpen: boolean;
  authModalMode: 'login' | 'register' | 'forgot';
  openAuthModal: (mode?: 'login' | 'register' | 'forgot') => void;
  closeAuthModal: () => void;
  loginUser: (email: string, pass: string) => Promise<void>;
  registerUser: (email: string, pass: string, name?: string, ref?: string) => Promise<void>;
  loginDemoUser: () => void;
  logoutUser: () => Promise<void>;
  updateUser: (updates: Partial<UserProfile>) => Promise<void>;
  isMobileDeviceFrame: boolean;
  toggleMobileFrame: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [accentTheme, setAccentThemeState] = useState<AccentTheme>(() => {
    return (localStorage.getItem('nexora_accent_theme') as AccentTheme) || 'emerald';
  });
  const [markets, setMarkets] = useState<CryptoMarket[]>([]);
  const [isMarketsLive, setIsMarketsLive] = useState<boolean>(false);
  const [marketConnectionStatus, setMarketConnectionStatus] = useState<MarketConnectionStatus>('CONNECTING');
  const [marketError, setMarketError] = useState<string | null>(null);
  const [lastMarketUpdate, setLastMarketUpdate] = useState<Date>(new Date());
  
  const [miningSession, setMiningSession] = useState<MiningSession>(LOGGED_OUT_MINING_SESSION);
  const [userContracts, setUserContracts] = useState<MiningContract[]>([]);
  const [isOfflineCache, setIsOfflineCache] = useState<boolean>(false);
  const [walletAssets, setWalletAssets] = useState<WalletAsset[]>(
    INITIAL_WALLET_ASSETS.map((a) => ({ ...a, balance: 0, lockedBalance: 0 }))
  );
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [dailyRewards, setDailyRewards] = useState<DailyReward[]>(
    INITIAL_DAILY_REWARDS.map((r, idx) => ({ ...r, isClaimed: false, isToday: idx === 0 }))
  );
  const [earnTasks, setEarnTasks] = useState<EarnTask[]>(INITIAL_EARN_TASKS);
  
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [isMobileDeviceFrame, setIsMobileDeviceFrame] = useState<boolean>(false);

  const [dailyStreakRecord, setDailyStreakRecord] = useState<DailyStreakRecord | null>(null);

  // Authentication State Listener
  useEffect(() => {
    const unsubscribe = AuthService.onAuthStateChanged((authUser) => {
      setUser((prevUser) => {
        // If user logged out or switched accounts (UID changed), immediately wipe user-scoped state
        if (prevUser?.id !== authUser?.id) {
          setWalletAssets(INITIAL_WALLET_ASSETS.map((a) => ({ ...a, balance: 0, lockedBalance: 0 })));
          setTransactions([]);
          setMiningSession(LOGGED_OUT_MINING_SESSION);
          setUserContracts([]);
          setDailyStreakRecord(null);
          setIsOfflineCache(false);
        }
        return authUser;
      });
    });
    return () => {
      unsubscribe();
    };
  }, []);

  // Sync security task completion statuses with current user state
  useEffect(() => {
    setEarnTasks((prev) =>
      prev.map((task) => {
        if (task.status === 'CLAIMED') return task;
        if (task.id === 'task_verify_email') {
          if (!user) return { ...task, status: 'AVAILABLE' };
          return {
            ...task,
            status: user.isEmailVerified || user.isDemo ? 'COMPLETED' : 'AVAILABLE',
          };
        }
        if (task.id === 'task_2fa') {
          if (!user) return { ...task, status: 'AVAILABLE' };
          return {
            ...task,
            status: user.twoFactorEnabled ? 'COMPLETED' : 'AVAILABLE',
          };
        }
        return task;
      })
    );
  }, [user?.id, user?.isEmailVerified, user?.twoFactorEnabled, user?.isDemo]);

  // Real-time Firestore sync for Wallet Balances, Transactions, Mining Session, Contracts & Daily Streak
  useEffect(() => {
    if (user && !user.isDemo) {
      // Baseline for real authenticated accounts: 0.00 until funded and confirmed
      setWalletAssets(INITIAL_WALLET_ASSETS.map((a) => ({ ...a, balance: 0, lockedBalance: 0 })));
      setTransactions([]);
      setMiningSession(LOGGED_OUT_MINING_SESSION);
      setUserContracts([]);
      setDailyRewards(DailyRewardsFirestoreService.computeDailyRewardsState(null));
      setDailyStreakRecord(null);
      setIsOfflineCache(false);

      // 1. Subscribe to users/{uid}/wallet subcollection (Read-only on client)
      const unsubWallet = WalletFirestoreService.subscribeUserWallet(
        user.id,
        (balances, meta) => {
          if (meta) setIsOfflineCache(Boolean(meta.fromCache));
          setWalletAssets((prev) =>
            prev.map((asset) => {
              const rec = balances[asset.symbol];
              if (rec) {
                return {
                  ...asset,
                  balance: rec.balance,
                  lockedBalance: rec.lockedBalance,
                };
              }
              return { ...asset, balance: 0, lockedBalance: 0 };
            })
          );
        },
        (err) => {
          console.warn('Firestore wallet listener notice:', err.message);
        }
      );

      // 2. Subscribe to users/{uid}/transactions subcollection
      const unsubTx = WalletFirestoreService.subscribeUserTransactions(
        user.id,
        (realTxs, meta) => {
          if (meta && !meta.fromCache) setIsOfflineCache(false);
          setTransactions(realTxs);
        },
        (err) => {
          console.warn('Firestore transactions listener notice:', err.message);
        }
      );

      // 3. Subscribe to users/{uid}/mining/session document
      const unsubMining = MiningFirestoreService.subscribeUserMiningSession(
        user.id,
        (session, meta) => {
          if (meta && meta.fromCache) setIsOfflineCache(true);
          setMiningSession(session);
        },
        (err) => {
          console.warn('Firestore mining session listener notice:', err.message);
        }
      );

      // 4. Subscribe to users/{uid}/contracts subcollection (Server-written only)
      const unsubContracts = MiningFirestoreService.subscribeUserContracts(
        user.id,
        (contracts) => {
          setUserContracts(contracts);
        },
        (err) => {
          console.warn('Firestore mining contracts listener notice:', err.message);
        }
      );

      // 5. Subscribe to users/{uid}/rewards/dailyStreak document
      const unsubStreak = DailyRewardsFirestoreService.subscribeDailyStreak(
        user.id,
        (record) => {
          setDailyStreakRecord(record);
          setDailyRewards(DailyRewardsFirestoreService.computeDailyRewardsState(record));
        },
        (err) => {
          console.warn('Firestore daily streak listener notice:', err.message);
        }
      );

      return () => {
        unsubWallet();
        unsubTx();
        unsubMining();
        unsubContracts();
        unsubStreak();
      };
    } else if (user && user.isDemo) {
      // Explicit Demo / sandbox session: load initial simulated demo assets, transactions, mining session & rewards
      const demoNow = new Date();
      const demoPurchaseIso = new Date(demoNow.getTime() - 12 * 86400 * 1000).toISOString();
      const demoExpireIso = new Date(demoNow.getTime() + 100 * 86400 * 1000).toISOString();
      setWalletAssets(INITIAL_WALLET_ASSETS);
      setTransactions(INITIAL_TRANSACTIONS);
      setMiningSession(INITIAL_MINING_SESSION);
      setUserContracts([
        {
          id: 'order_demo_stratum_01',
          orderId: 'order_demo_stratum_01',
          userId: user.id,
          planId: 'plan_stratum_yard',
          planName: 'Stratum Yard',
          tier: 'Value',
          algorithm: 'SHA-256',
          targetCoin: 'BTC',
          hashrate: 34,
          hashrateUnit: 'GH/s',
          hashrateGHs: 34,
          hashrateTHs: 0.034,
          priceUSD: 135.0,
          asset: 'USDT',
          durationDays: 112,
          displayedReturnPercent: 172.0,
          estimatedDailyYieldCoin: 0.000022,
          estimatedDailyYieldUSD: 2.07,
          powerConsumptionW: 544,
          maintenanceFeePercent: 4.5,
          status: 'ACTIVE',
          purchasedAt: demoPurchaseIso,
          expiresAt: demoExpireIso,
          settlementId: 'settle_order_demo_stratum_01',
          txId: 'order_demo_stratum_01',
          sessionId: INITIAL_MINING_SESSION.id,
          isSimulated: true,
        },
      ]);
      setDailyRewards(INITIAL_DAILY_REWARDS);
      setDailyStreakRecord(null);
      setIsOfflineCache(false);
    } else {
      // Logged-out visitor: zeroed balances, empty transactions, idle session
      setWalletAssets(INITIAL_WALLET_ASSETS.map((a) => ({ ...a, balance: 0, lockedBalance: 0 })));
      setTransactions([]);
      setMiningSession(LOGGED_OUT_MINING_SESSION);
      setUserContracts([]);
      setDailyRewards(INITIAL_DAILY_REWARDS.map((r, idx) => ({ ...r, isClaimed: false, isToday: idx === 0 })));
      setDailyStreakRecord(null);
      setIsOfflineCache(false);
      setEarnTasks(INITIAL_EARN_TASKS.map((t) => ({ ...t, status: t.id === 'task_mine_24h' ? 'IN_PROGRESS' : 'AVAILABLE' })));
    }
  }, [user?.id, user?.isDemo]);

  const addToast = (title: string, message: string, type: ToastMessage['type'] = 'info') => {
    const id = 'toast_' + Date.now() + Math.random().toString(36).substring(2, 6);
    setToasts((prev) => [...prev, { id, title, message, type }]);
    setTimeout(() => {
      removeToast(id);
    }, 4500);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const openAuthModal = (mode: 'login' | 'register' | 'forgot' = 'login') => {
    setAuthModalMode(mode);
    setAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setAuthModalOpen(false);
  };

  const updateUser = async (updates: Partial<UserProfile>): Promise<void> => {
    try {
      const updated = await AuthService.updateUser(updates);
      setUser(updated);
      addToast('Profile Updated', 'Your profile details have been saved.', 'success');
    } catch (error: any) {
      const msg = error?.message || 'Failed to update profile. Please try again.';
      addToast('Update Failed', msg, 'error');
      throw error;
    }
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', accentTheme);
  }, [accentTheme]);

  const setAccentTheme = (theme: AccentTheme) => {
    setAccentThemeState(theme);
    localStorage.setItem('nexora_accent_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    if (user) {
      updateUser({ accentTheme: theme }).catch(() => {
        // theme is saved in localStorage anyway
      });
    }
    const themeNames: Record<AccentTheme, string> = {
      emerald: 'Emerald Matrix',
      violet: 'Neon Violet',
      blue: 'Electric Blue',
    };
    addToast('Accent Theme Updated', `${themeNames[theme]} applied successfully.`, 'success');
  };

  const refreshMarkets = async () => {
    try {
      const res = await fetchLiveMarketTickers();
      setMarkets((prev) =>
        res.markets.map((fresh) => {
          const existing = prev.find((p) => p.pair === fresh.pair);
          const tickDirection =
            existing && fresh.price !== existing.price
              ? fresh.price > existing.price
                ? 'up'
                : 'down'
              : existing?.tickDirection || 'neutral';
          return { ...fresh, tickDirection };
        })
      );
      setIsMarketsLive(res.isLive);
      setLastMarketUpdate(res.lastUpdated);
      setMarketError(null);
    } catch (err: any) {
      setIsMarketsLive(false);
      setMarketError(err?.message || 'Unable to load Binance Spot market snapshot.');
    }
  };

  useEffect(() => {
    refreshMarkets();

    const unsubscribeWs = subscribeMarketTickersWebSocket(
      (batch) => {
        setMarkets((prev) => {
          const baseList: CryptoMarket[] =
            prev.length > 0
              ? prev
              : SUPPORTED_BINANCE_PAIRS.map((meta) => ({
                  symbol: meta.symbol,
                  pair: meta.pair,
                  displayPair: meta.displayPair,
                  name: meta.name,
                  price: 0,
                  priceChange24h: 0,
                  change24h: 0,
                  high24h: 0,
                  low24h: 0,
                  volume24h: 0,
                  baseVolume24h: 0,
                  lastUpdated: new Date().toISOString(),
                  tickDirection: 'neutral',
                  isPoW: meta.isPoW,
                  algorithm: meta.algorithm,
                }));

          return baseList
            .map((coin) => {
              const tick = batch[coin.pair];
              if (!tick) return coin;
              const tickDirection: 'up' | 'down' | 'neutral' =
                coin.price > 0 && tick.price !== coin.price
                  ? tick.price > coin.price
                    ? 'up'
                    : 'down'
                  : coin.tickDirection || 'neutral';
              return {
                ...coin,
                price: tick.price,
                priceChange24h: tick.priceChange24h,
                change24h: tick.change24h,
                high24h: tick.high24h,
                low24h: tick.low24h,
                baseVolume24h: tick.baseVolume24h,
                volume24h: tick.volume24h,
                lastUpdated: tick.eventTime,
                tickDirection,
              };
            })
            .filter((c) => c.price > 0);
        });
        setIsMarketsLive(true);
        setMarketError(null);
        setLastMarketUpdate(new Date());
      },
      (status) => {
        setMarketConnectionStatus(status);
        if (status === 'CONNECTED') {
          setIsMarketsLive(true);
        }
      }
    );

    const fallbackInterval = setInterval(() => {
      refreshMarkets();
    }, 30000);

    return () => {
      unsubscribeWs();
      clearInterval(fallbackInterval);
    };
  }, []);

  // Keep wallet asset USD valuations synchronized with live Binance Spot prices
  useEffect(() => {
    if (markets.length === 0) return;
    setWalletAssets((prev) =>
      prev.map((asset) => {
        if (asset.symbol === 'USDT') return { ...asset, usdRate: 1 };
        const liveMarket = markets.find((m) => m.symbol === asset.symbol);
        if (liveMarket && liveMarket.price > 0 && liveMarket.price !== asset.usdRate) {
          return { ...asset, usdRate: liveMarket.price };
        }
        return asset;
      })
    );
  }, [markets]);

  // Mining simulated progress loop
  useEffect(() => {
    if (miningSession.status !== 'ACTIVE' || !user) return;

    const timer = setInterval(() => {
      setMiningSession((prev) => {
        const deltaSeconds = 2;
        const activeGHs =
          typeof prev.hashrateGHs === 'number' && prev.hashrateGHs > 0
            ? prev.hashrateGHs
            : prev.hashrateTHs > 0
            ? prev.hashrateTHs * 1000
            : 0;
        const dailyCoinEstimate = activeGHs > 0 ? activeGHs * 0.00000065 : 0;
        const rewardPerSec = dailyCoinEstimate / 86400;
        const newEstimated = prev.todayEstimatedRewardCoin + rewardPerSec * deltaSeconds;
        const currentBtcPrice = markets.find((m) => m.symbol === 'BTC')?.price || 94250;

        return {
          ...prev,
          uptimeSeconds: prev.uptimeSeconds + deltaSeconds,
          todayEstimatedRewardCoin: Number(newEstimated.toFixed(8)),
          todayEstimatedRewardUSD: Number((newEstimated * currentBtcPrice).toFixed(2)),
          acceptedShares: prev.acceptedShares + (activeGHs > 0 && Math.random() > 0.6 ? 1 : 0),
          temperatureC: Number((58.0 + Math.random() * 1.5).toFixed(1)),
        };
      });
    }, 2000);

    return () => clearInterval(timer);
  }, [miningSession.status, markets, user]);

  const toggleMining = async () => {
    if (!user) {
      openAuthModal('login');
      addToast('Sign In Required', 'Please sign in or enter Sandbox Demo Mode to start cloud mining.', 'warning');
      return;
    }

    if (!user.isDemo) {
      try {
        const updated = await MiningFirestoreService.toggleMiningSession(user.id, miningSession);
        setMiningSession(updated);
        if (updated.status === 'ACTIVE') {
          addToast('Mining Session Activated', 'Cloud miner active. Telemetry synced to Firestore.', 'success');
        } else {
          addToast('Mining Session Paused', 'Cloud hash allocation paused and persisted to Firestore.', 'warning');
        }
      } catch (err: any) {
        addToast('Mining Error', err?.message || 'Failed to toggle cloud mining session.', 'error');
      }
    } else {
      // Demo mode
      if (miningSession.status === 'ACTIVE') {
        setMiningSession((prev) => ({
          ...prev,
          status: 'PAUSED',
        }));
        addToast('Mining Paused', '[DEMO] Cloud hash allocation temporarily paused.', 'warning');
      } else {
        setMiningSession((prev) => ({
          ...prev,
          status: 'ACTIVE',
          startedAt: new Date().toISOString(),
        }));
        addToast('Mining Activated', '[DEMO] Cloud miner reconnected to Stratum simulation.', 'success');
      }
    }
  };

  const setHardwareProfile = async (profile: 'Eco' | 'Balanced' | 'Turbo Overclock') => {
    if (!user) {
      openAuthModal('login');
      addToast('Sign In Required', 'Please sign in or enter Sandbox Demo Mode to configure hardware profiles.', 'warning');
      return;
    }

    let multiplier = 1.0;
    let power = 16.0;
    if (profile === 'Eco') {
      multiplier = 0.85;
      power = 13.8;
    } else if (profile === 'Turbo Overclock') {
      multiplier = 1.25;
      power = 19.5;
    }

    const baseGHs =
      userContracts
        .filter((c) => c.status === 'ACTIVE')
        .reduce((sum, c) => sum + (c.hashrateGHs || c.hashrate || 0), 0) ||
      miningSession.hashrateGHs ||
      (miningSession.hashrateTHs > 0 ? miningSession.hashrateTHs * 1000 : 10);

    const newHashrateGHs = Number((baseGHs * multiplier).toFixed(2));
    const newHashrateTHs = Number((newHashrateGHs / 1000).toFixed(6));

    if (!user.isDemo) {
      try {
        await MiningFirestoreService.updateHardwareProfile(user.id, profile, miningSession);
        setMiningSession((prev) => ({
          ...prev,
          hardwareProfile: profile,
          hashrateGHs: newHashrateGHs,
          hashrateTHs: newHashrateTHs,
          efficiencyWTH: power,
        }));
        addToast('Hardware Profile Applied', `Switched mode to ${profile}. Synced to Firestore.`, 'info');
      } catch (err: any) {
        addToast('Profile Update Error', err?.message || 'Failed to update tuning profile.', 'error');
      }
    } else {
      setMiningSession((prev) => ({
        ...prev,
        hardwareProfile: profile,
        hashrateGHs: newHashrateGHs,
        hashrateTHs: newHashrateTHs,
        efficiencyWTH: power,
      }));
      addToast('Hardware Profile Applied', `[DEMO] Switched mode to ${profile}.`, 'info');
    }
  };

  const claimDailyReward = async (day: number) => {
    if (!user) {
      openAuthModal('login');
      addToast('Sign In Required', 'Please sign in or enter Sandbox Demo Mode to claim daily streak rewards.', 'warning');
      return;
    }

    if (!user.isDemo) {
      try {
        const result = await DailyRewardsFirestoreService.claimDailyReward(user.id, day, dailyStreakRecord);
        setDailyStreakRecord(result.streakRecord);
        setDailyRewards(DailyRewardsFirestoreService.computeDailyRewardsState(result.streakRecord));

        try {
          confetti({
            particleCount: 65,
            spread: 60,
            origin: { y: 0.7 },
            colors: ['#06b6d4', '#10b981', '#f59e0b'],
          });
        } catch {
          // ignore
        }

        addToast(
          'Daily Check-in Saved!',
          result.message,
          'success'
        );
      } catch (err: any) {
        addToast('Check-in Notice', err?.message || 'Could not claim daily reward.', 'error');
      }
    } else {
      // Demo / Sandbox simulation mode
      const target = dailyRewards.find((d) => d.day === day);
      if (!target) return;
      if (target.isClaimed) {
        addToast('Already Claimed', `[DEMO] Day ${day} streak reward was already claimed.`, 'warning');
        return;
      }

      try {
        confetti({
          particleCount: 65,
          spread: 60,
          origin: { y: 0.7 },
          colors: ['#06b6d4', '#10b981', '#f59e0b'],
        });
      } catch {
        // ignore
      }

      setDailyRewards((prev) =>
        prev.map((d) => {
          if (d.day === day) return { ...d, isClaimed: true, isToday: false };
          if (d.day === day + 1) return { ...d, isToday: true };
          return d;
        })
      );

      setWalletAssets((prev) =>
        prev.map((asset) => {
          if (asset.symbol === 'USDT') {
            return { ...asset, balance: Number((asset.balance + target.rewardUSD).toFixed(2)) };
          }
          return asset;
        })
      );

      const todayUTC = DailyRewardsFirestoreService.getTodayUTCDate();
      const demoTx: Transaction = {
        id: 'tx-demo-' + Date.now().toString().slice(-5),
        type: 'TASK_REWARD',
        asset: 'USDT',
        amount: target.rewardUSD,
        amountUSD: target.rewardUSD,
        fee: 0,
        status: 'COMPLETED',
        timestamp: new Date().toISOString(),
        claimDate: todayUTC,
        rewardDay: todayUTC,
        streakDay: day,
        rewardSource: 'DAILY_STREAK',
        note: `[DEMO] Daily Streak Day ${day} Check-in Bonus`,
        isDemo: true,
      };
      setTransactions((prev) => [demoTx, ...prev]);

      addToast('Streak Bonus Claimed!', `[DEMO] +$${target.rewardUSD.toFixed(2)} USDT simulated in sandbox wallet.`, 'success');
    }
  };

  const claimTaskReward = async (taskId: string) => {
    if (!user) {
      openAuthModal('login');
      addToast('Sign In Required', 'Please sign in or enter Sandbox Demo Mode to claim task bounties.', 'warning');
      return;
    }

    const task = earnTasks.find((t) => t.id === taskId);
    if (!task) return;
    if (task.status === 'CLAIMED') {
      addToast('Already Claimed', 'This bounty was already claimed.', 'info');
      return;
    }

    // Prevent duplicate task reward submission if a pending/completed claim for this taskId already exists
    const existingTaskTx = transactions.find(
      (t) =>
        t.type === 'TASK_REWARD' &&
        t.taskId === task.id &&
        (t.status === 'PENDING_REVIEW' || t.status === 'PENDING_CONFIRMATION' || t.status === 'COMPLETED')
    );
    if (existingTaskTx) {
      addToast('Already Submitted', `A claim for "${task.title}" has already been submitted (${existingTaskTx.status}).`, 'info');
      return;
    }

    setEarnTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: 'CLAIMED' } : t))
    );

    try {
      confetti({ particleCount: 50, spread: 50, origin: { y: 0.7 } });
    } catch {
      // ignore
    }

    if (!user.isDemo) {
      try {
        await DailyRewardsFirestoreService.claimTaskReward(user.id, task.id);
        addToast(
          'Bounty Submitted',
          `Bounty for "${task.title}" saved in Firestore as PENDING_REVIEW. Client balance crediting is blocked; requires trusted verification.`,
          'info'
        );
      } catch (err: any) {
        const isPermissionDenied =
          err?.code === 'permission-denied' ||
          (typeof err?.message === 'string' && err.message.includes('permission'));
        if (isPermissionDenied) {
          console.warn('Note: Firestore rules unpublished in console; task reward recorded in current session.');
          addToast(
            'Bounty Recorded (Session)',
            `Bounty for "${task.title}" recorded in active session. Deploy local firestore.rules to your Firebase Console to persist across devices.`,
            'info'
          );
        } else {
          console.warn('Error submitting task reward request:', err);
          addToast('Bounty Request Notice', err?.message || 'Could not record bounty request in Firestore.', 'error');
        }
      }
    } else {
      // Demo sandbox simulation
      setWalletAssets((prev) =>
        prev.map((asset) => {
          if (asset.symbol === task.rewardAsset) {
            return { ...asset, balance: Number((asset.balance + task.rewardUSD).toFixed(2)) };
          }
          return asset;
        })
      );
      const demoTaskTx: Transaction = {
        id: 'tx-demo-' + Date.now().toString().slice(-5),
        type: 'TASK_REWARD',
        asset: task.rewardAsset,
        amount: task.rewardUSD,
        amountUSD: task.rewardUSD,
        fee: 0,
        status: 'COMPLETED',
        timestamp: new Date().toISOString(),
        claimDate: DailyRewardsFirestoreService.getTodayUTCDate(),
        taskId: task.id,
        rewardSource: 'TASK_BOUNTY',
        note: `[DEMO] Task Bounty: ${task.title}`,
        isDemo: true,
      };
      setTransactions((prev) => [demoTaskTx, ...prev]);
      addToast('Bounty Claimed!', `[DEMO] +$${task.rewardUSD.toFixed(2)} ${task.rewardAsset} credited in sandbox wallet.`, 'success');
    }
  };

  const submitDepositRequest = async (
    assetSymbol: string,
    network: string,
    amount: number,
    txHash: string
  ): Promise<{ success: boolean; message: string }> => {
    if (!user) {
      openAuthModal('login');
      return { success: false, message: 'Please sign in or enter Sandbox Demo Mode before submitting a deposit.' };
    }
    if (!amount || amount <= 0) {
      return { success: false, message: 'Deposit amount must be greater than zero.' };
    }
    if (!txHash || txHash.trim().length < 8) {
      return { success: false, message: 'Please provide a valid blockchain transaction hash (TxID).' };
    }

    const asset = walletAssets.find((a) => a.symbol === assetSymbol);
    const usdRate = asset?.usdRate || 1;

    // Check if user is an authenticated Firebase user
    if (!user.isDemo) {
      try {
        const newTx = await WalletFirestoreService.submitDepositRequest(user.id, {
          assetSymbol,
          network,
          amount,
          txHash,
          usdRate,
        });

        setTransactions((prev) => {
          if (prev.some((t) => t.id === newTx.id)) return prev;
          return [newTx, ...prev];
        });

        addToast(
          'Deposit Request Saved',
          `Deposit request for ${amount} ${assetSymbol} saved to Firestore as PENDING_CONFIRMATION. Balances remain unchanged until confirmed and processed.`,
          'info'
        );
        return {
          success: true,
          message: 'Deposit request saved in Firestore. Status: PENDING_CONFIRMATION (Awaiting backend verification).',
        };
      } catch (err: any) {
        const errorMsg = err?.message || 'Failed to submit deposit request to Cloud Firestore.';
        addToast('Deposit Request Error', errorMsg, 'error');
        return { success: false, message: errorMsg };
      }
    } else {
      // Demo / Sandbox mode
      const amountUSD = Number((amount * usdRate).toFixed(2));
      const demoTx: Transaction = {
        id: 'tx-demo-' + Date.now().toString().slice(-5),
        type: 'DEPOSIT',
        asset: assetSymbol,
        amount,
        amountUSD,
        fee: 0,
        status: 'PENDING_CONFIRMATION',
        timestamp: new Date().toISOString(),
        network,
        txHash: txHash.trim(),
        note: '[DEMO] Pending Blockchain Node Confirmations (Simulated)',
        isDemo: true,
      };

      setTransactions((prev) => [demoTx, ...prev]);
      addToast(
        'Demo Deposit Queued',
        `[DEMO] Simulated deposit of ${amount} ${assetSymbol} added to local demo ledger.`,
        'info'
      );
      return {
        success: true,
        message: '[DEMO] Simulated deposit request created. Log in to save real requests to Firestore.',
      };
    }
  };

  const submitWithdrawalRequest = async (
    assetSymbol: string,
    network: string,
    amount: number,
    address: string
  ): Promise<{ success: boolean; message: string }> => {
    if (!user) {
      openAuthModal('login');
      return { success: false, message: 'Please sign in or enter Sandbox Demo Mode before requesting a withdrawal.' };
    }

    const asset = walletAssets.find((a) => a.symbol === assetSymbol);
    if (!asset) {
      return { success: false, message: 'Asset not found.' };
    }
    if (amount < asset.minWithdraw) {
      return { success: false, message: `Minimum withdrawal is ${asset.minWithdraw} ${asset.symbol}.` };
    }
    if (amount <= asset.withdrawFee) {
      return { success: false, message: `Withdrawal amount must exceed the network fee of ${asset.withdrawFee} ${asset.symbol}.` };
    }
    if (amount > asset.balance) {
      return { success: false, message: 'Insufficient available balance.' };
    }
    if (!address || address.trim().length < 12) {
      return { success: false, message: 'Please provide a valid destination wallet address.' };
    }

    if (!user.isDemo) {
      try {
        const newTx = await WalletFirestoreService.submitWithdrawalRequest(user.id, {
          assetSymbol,
          network,
          amount,
          address,
          fee: asset.withdrawFee,
          usdRate: asset.usdRate,
        });

        setTransactions((prev) => {
          if (prev.some((t) => t.id === newTx.id)) return prev;
          return [newTx, ...prev];
        });

        const netAmount = Number((amount - asset.withdrawFee).toFixed(6));
        addToast(
          'Withdrawal Request Queued',
          newTx.reservedFromBalance
            ? `Withdrawal of ${amount} ${assetSymbol} (${netAmount} ${assetSymbol} net after ${asset.withdrawFee} ${assetSymbol} fee) reserved in escrow as PENDING_REVIEW.`
            : `Withdrawal request for ${amount} ${assetSymbol} (${netAmount} ${assetSymbol} net) saved in Firestore as PENDING_REVIEW.`,
          'warning'
        );
        return {
          success: true,
          message: newTx.reservedFromBalance
            ? `Withdrawal reserved in escrow (${netAmount} ${assetSymbol} net payout).`
            : 'Withdrawal request saved in Firestore as PENDING_REVIEW.',
        };
      } catch (err: any) {
        const errorMsg = err?.message || 'Failed to submit withdrawal request to Cloud Firestore.';
        addToast('Withdrawal Denied', errorMsg, 'error');
        return { success: false, message: errorMsg };
      }
    } else {
      // Demo / Sandbox mode
      setWalletAssets((prev) =>
        prev.map((a) => {
          if (a.symbol === assetSymbol) {
            return {
              ...a,
              balance: Number((a.balance - amount).toFixed(6)),
              lockedBalance: Number((a.lockedBalance + amount).toFixed(6)),
            };
          }
          return a;
        })
      );

      const amountUSD = Number((amount * asset.usdRate).toFixed(2));
      const demoTx: Transaction = {
        id: 'tx-demo-' + Date.now().toString().slice(-5),
        type: 'WITHDRAWAL',
        asset: assetSymbol,
        amount,
        amountUSD,
        fee: asset.withdrawFee,
        status: 'PENDING_REVIEW',
        timestamp: new Date().toISOString(),
        network,
        toAddress: address,
        note: '[DEMO] Awaiting Automated Compliance & Signer Node (Simulated)',
        isDemo: true,
      };

      setTransactions((prev) => [demoTx, ...prev]);
      addToast(
        'Demo Withdrawal Queued',
        `[DEMO] Simulated withdrawal of ${amount} ${assetSymbol}. Under demo review.`,
        'warning'
      );
      return {
        success: true,
        message: '[DEMO] Simulated withdrawal request submitted.',
      };
    }
  };

  const submitPlanOrder = async (
    planIdOrName: string,
    idempotencyKey?: string
  ): Promise<{ success: boolean; message: string; contract?: MiningContract }> => {
    if (!user) {
      openAuthModal('login');
      return {
        success: false,
        message: 'Please sign in or enter Sandbox Demo Mode to select a cloud mining contract.',
      };
    }

    const plan = MINING_PLANS.find((p) => p.id === planIdOrName || p.name === planIdOrName);
    if (!plan) {
      return {
        success: false,
        message: `Unsupported cloud mining contract '${planIdOrName}'.`,
      };
    }

    // 1. Authenticated Firebase account: Execute atomic server-side order & USDT settlement
    if (!user.isDemo) {
      const orderKey =
        idempotencyKey && idempotencyKey.trim().length >= 6
          ? idempotencyKey.trim()
          : `${user.id.slice(0, 8)}_${plan.id}_${Date.now()}`;

      try {
        const res = await MiningFirestoreService.purchaseContract(plan.id, orderKey);

        // Immediately reflect server-confirmed balance, contract, transaction, and hashrate
        setWalletAssets((prev) =>
          prev.map((a) => (a.symbol === 'USDT' ? { ...a, balance: res.newBalance } : a))
        );

        if (res.contract) {
          setUserContracts((prev) => {
            const filtered = prev.filter((c) => c.id !== res.contract.id);
            return [res.contract, ...filtered];
          });
        }

        if (res.transaction) {
          setTransactions((prev) => {
            if (prev.some((t) => t.id === res.transaction.id)) return prev;
            return [{ ...res.transaction, isDemo: false }, ...prev];
          });
        }

        setMiningSession((prev) => ({
          ...prev,
          status: 'ACTIVE',
          planId: plan.id,
          activeContractId: res.contract?.id || prev.activeContractId,
          activeContractName: plan.name,
          hashrateGHs: res.newHashrateGHs,
          hashrateTHs: res.newHashrateTHs,
          startedAt: prev.startedAt || new Date().toISOString(),
        }));

        try {
          confetti({
            particleCount: 55,
            spread: 60,
            origin: { y: 0.7 },
            colors: ['#00D6A3', '#25B9F3', '#F3B64B'],
          });
        } catch {
          // ignore
        }

        addToast(
          res.alreadyProcessed ? 'Order Already Settled' : 'Contract Activated!',
          res.message,
          res.alreadyProcessed ? 'info' : 'success'
        );

        return {
          success: true,
          message: res.message,
          contract: res.contract,
        };
      } catch (err: any) {
        const errMsg = err?.message || 'Could not complete cloud mining contract purchase.';
        return {
          success: false,
          message: errMsg,
        };
      }
    }

    // 2. Demo Sandbox simulation mode
    const usdt = walletAssets.find((a) => a.symbol === 'USDT');
    if (!usdt || usdt.balance < plan.priceUSD) {
      return {
        success: false,
        message: `Insufficient USDT balance ($${plan.priceUSD.toFixed(2)} required). Please deposit USDT first.`,
      };
    }

    const demoOrderId =
      idempotencyKey && idempotencyKey.trim().length >= 6
        ? `order_${idempotencyKey.trim()}`
        : 'order_demo_' + Date.now().toString().slice(-6);

    const existingDemoContract = userContracts.find((c) => c.id === demoOrderId || c.orderId === demoOrderId);
    if (existingDemoContract) {
      return {
        success: true,
        message: `[DEMO] Order ${demoOrderId} for ${plan.name} was already settled.`,
        contract: existingDemoContract,
      };
    }

    setWalletAssets((prev) =>
      prev.map((a) =>
        a.symbol === 'USDT' ? { ...a, balance: Number((a.balance - plan.priceUSD).toFixed(2)) } : a
      )
    );

    const nowIso = new Date().toISOString();
    setMiningSession((prev) => {
      const prevGHs =
        typeof prev.hashrateGHs === 'number' ? prev.hashrateGHs : prev.hashrateTHs * 1000;
      const nextGHs = Number((prevGHs + plan.hashrateGHs).toFixed(2));
      const nextTHs = Number((nextGHs / 1000).toFixed(6));
      return {
        ...prev,
        status: 'ACTIVE',
        planId: plan.id,
        activeContractId: demoOrderId,
        activeContractName: plan.name,
        hashrateGHs: nextGHs,
        hashrateTHs: nextTHs,
        startedAt: prev.startedAt || nowIso,
      };
    });

    const demoContract: MiningContract = {
      id: demoOrderId,
      orderId: demoOrderId,
      userId: user.id,
      planId: plan.id,
      planName: plan.name,
      tier: plan.tier,
      algorithm: plan.algorithm,
      targetCoin: plan.targetCoin,
      hashrate: plan.hashrate,
      hashrateUnit: plan.hashrateUnit,
      hashrateGHs: plan.hashrateGHs,
      hashrateTHs: plan.hashrateTHs,
      priceUSD: plan.priceUSD,
      asset: 'USDT',
      durationDays: plan.durationDays,
      displayedReturnPercent: plan.displayedReturnPercent,
      estimatedDailyYieldCoin: plan.estimatedDailyYieldCoin,
      estimatedDailyYieldUSD: plan.estimatedDailyYieldUSD,
      powerConsumptionW: plan.powerConsumptionW,
      maintenanceFeePercent: plan.maintenanceFeePercent,
      status: 'ACTIVE',
      purchasedAt: nowIso,
      expiresAt: new Date(Date.now() + plan.durationDays * 86400 * 1000).toISOString(),
      settlementId: `settle_${demoOrderId}`,
      txId: demoOrderId,
      sessionId: miningSession.id,
      isSimulated: true,
    };
    setUserContracts((prev) => [demoContract, ...prev]);

    const demoTx: Transaction = {
      id: demoOrderId,
      orderId: demoOrderId,
      contractId: demoOrderId,
      planId: plan.id,
      planName: plan.name,
      type: 'CONTRACT_PURCHASE',
      asset: 'USDT',
      amount: plan.priceUSD,
      amountUSD: plan.priceUSD,
      fee: 0,
      status: 'COMPLETED',
      settlementStatus: 'PURCHASED',
      timestamp: nowIso,
      note: `[DEMO] Cloud Hashrate Contract Purchase: ${plan.name} (+${plan.hashrate} ${plan.hashrateUnit})`,
      isDemo: true,
    };
    setTransactions((prev) => [demoTx, ...prev]);

    addToast(
      'Demo Plan Activated!',
      `[DEMO] Allocated +${plan.hashrate} ${plan.hashrateUnit} simulated hashpower for ${plan.name}.`,
      'success'
    );
    return {
      success: true,
      message: `[DEMO] ${plan.name} activated in sandbox mode!`,
      contract: demoContract,
    };
  };

  const loginUser = async (email: string, pass: string) => {
    try {
      const logged = await AuthService.login(email, pass);
      setUser(logged);
      setAuthModalOpen(false);
      setActiveTab('home');
      addToast('Welcome Back', `Logged in as ${logged.displayName || logged.email}`, 'success');
    } catch (error: any) {
      const msg = error?.message || 'Login failed. Please check your credentials.';
      addToast('Login Failed', msg, 'error');
      throw error;
    }
  };

  const registerUser = async (email: string, pass: string, name?: string, ref?: string) => {
    try {
      const registered = await AuthService.register(email, pass, name, ref);
      setUser(registered);
      setAuthModalOpen(false);
      setActiveTab('home');
      addToast('Account Created', 'Registration successful! Verification email sent.', 'success');
    } catch (error: any) {
      const msg = error?.message || 'Registration failed. Please check your credentials.';
      addToast('Registration Failed', msg, 'error');
      throw error;
    }
  };

  const loginDemoUser = () => {
    const demo = AuthService.loginAsDemo();
    setUser(demo);
    setAuthModalOpen(false);
    setActiveTab('home');
    addToast('Sandbox Demo Mode Active', 'Loaded offline demo session. Not connected to Firebase.', 'warning');
  };

  const logoutUser = async () => {
    await AuthService.logout();
    setUser(null);
    setWalletAssets(INITIAL_WALLET_ASSETS.map((a) => ({ ...a, balance: 0, lockedBalance: 0 })));
    setTransactions([]);
    setMiningSession(LOGGED_OUT_MINING_SESSION);
    setUserContracts([]);
    setDailyStreakRecord(null);
    setIsOfflineCache(false);
    setActiveTab('home');
    addToast('Signed Out', 'You have been logged out of your session.', 'info');
  };

  const refreshWalletState = async () => {
    if (!user || user.isDemo) return;
    try {
      const [balances, streak] = await Promise.all([
        WalletFirestoreService.fetchUserWallet(user.id).catch(() => null),
        DailyRewardsFirestoreService.fetchDailyStreak(user.id).catch(() => null),
      ]);
      if (balances) {
        const anyCached = Object.values(balances).some((b) => b.isFromCache);
        setIsOfflineCache(anyCached);
        setWalletAssets((prev) =>
          prev.map((asset) => {
            const rec = balances[asset.symbol];
            return rec
              ? { ...asset, balance: rec.balance, lockedBalance: rec.lockedBalance }
              : { ...asset, balance: 0, lockedBalance: 0 };
          })
        );
      }
      if (streak) {
        setDailyStreakRecord(streak);
        setDailyRewards(DailyRewardsFirestoreService.computeDailyRewardsState(streak));
      }
    } catch {
      // ignore
    }
  };

  const toggleMobileFrame = () => {
    setIsMobileDeviceFrame((prev) => !prev);
  };

  return (
    <AppContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        activeTab,
        setActiveTab,
        accentTheme,
        setAccentTheme,
        markets,
        isMarketsLive,
        marketConnectionStatus,
        marketError,
        lastMarketUpdate,
        refreshMarkets,
        miningSession,
        userContracts,
        isOfflineCache,
        toggleMining,
        setHardwareProfile,
        walletAssets,
        transactions,
        dailyRewards,
        dailyStreakRecord,
        earnTasks,
        claimDailyReward,
        claimTaskReward,
        submitDepositRequest,
        submitWithdrawalRequest,
        refreshWalletState,
        submitPlanOrder,
        toasts,
        addToast,
        removeToast,
        authModalOpen,
        authModalMode,
        openAuthModal,
        closeAuthModal,
        loginUser,
        registerUser,
        loginDemoUser,
        logoutUser,
        updateUser,
        isMobileDeviceFrame,
        toggleMobileFrame,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
