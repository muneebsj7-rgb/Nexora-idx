import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { UserProfile, CryptoMarket, MiningSession, WalletAsset, Transaction, DailyReward, EarnTask } from '../types';
import { AuthService } from '../services/authService';
import { fetchLiveMarketTickers } from '../services/marketService';
import { INITIAL_MINING_SESSION } from '../services/miningService';
import { INITIAL_WALLET_ASSETS, INITIAL_TRANSACTIONS } from '../services/walletService';
import { INITIAL_DAILY_REWARDS, INITIAL_EARN_TASKS } from '../services/earnService';
import confetti from 'canvas-confetti';

export type NavTab = 'home' | 'mining' | 'markets' | 'wallet' | 'earn' | 'profile';
export type AccentTheme = 'emerald' | 'violet' | 'blue';

export interface ToastMessage {
  id: string;
  title: string;
  message: string;
  type: 'success' | 'info' | 'warning' | 'error';
}

interface AppContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  accentTheme: AccentTheme;
  setAccentTheme: (theme: AccentTheme) => void;
  markets: CryptoMarket[];
  isMarketsLive: boolean;
  lastMarketUpdate: Date;
  refreshMarkets: () => Promise<void>;
  miningSession: MiningSession;
  toggleMining: () => void;
  setHardwareProfile: (profile: 'Eco' | 'Balanced' | 'Turbo Overclock') => void;
  walletAssets: WalletAsset[];
  transactions: Transaction[];
  dailyRewards: DailyReward[];
  earnTasks: EarnTask[];
  claimDailyReward: (day: number) => void;
  claimTaskReward: (taskId: string) => void;
  submitDepositRequest: (assetSymbol: string, network: string, amount: number, txHash: string) => { success: boolean; message: string };
  submitWithdrawalRequest: (assetSymbol: string, network: string, amount: number, address: string) => { success: boolean; message: string };
  submitPlanOrder: (planName: string, priceUSD: number) => { success: boolean; message: string };
  toasts: ToastMessage[];
  addToast: (title: string, message: string, type?: ToastMessage['type']) => void;
  removeToast: (id: string) => void;
  authModalOpen: boolean;
  authModalMode: 'login' | 'register' | 'forgot';
  openAuthModal: (mode?: 'login' | 'register' | 'forgot') => void;
  closeAuthModal: () => void;
  loginUser: (email: string, pass: string) => Promise<void>;
  registerUser: (email: string, pass: string, name?: string, ref?: string) => Promise<void>;
  logoutUser: () => Promise<void>;
  updateUser: (updates: Partial<UserProfile>) => void;
  isMobileDeviceFrame: boolean;
  toggleMobileFrame: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(() => AuthService.initialize());
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [accentTheme, setAccentThemeState] = useState<AccentTheme>(() => {
    return (localStorage.getItem('nexora_accent_theme') as AccentTheme) || 'emerald';
  });
  const [markets, setMarkets] = useState<CryptoMarket[]>([]);
  const [isMarketsLive, setIsMarketsLive] = useState<boolean>(false);
  const [lastMarketUpdate, setLastMarketUpdate] = useState<Date>(new Date());
  
  const [miningSession, setMiningSession] = useState<MiningSession>(INITIAL_MINING_SESSION);
  const [walletAssets, setWalletAssets] = useState<WalletAsset[]>(INITIAL_WALLET_ASSETS);
  const [transactions, setTransactions] = useState<Transaction[]>(INITIAL_TRANSACTIONS);
  const [dailyRewards, setDailyRewards] = useState<DailyReward[]>(INITIAL_DAILY_REWARDS);
  const [earnTasks, setEarnTasks] = useState<EarnTask[]>(INITIAL_EARN_TASKS);
  
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [isMobileDeviceFrame, setIsMobileDeviceFrame] = useState<boolean>(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', accentTheme);
  }, [accentTheme]);

  const setAccentTheme = (theme: AccentTheme) => {
    setAccentThemeState(theme);
    localStorage.setItem('nexora_accent_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    if (user) {
      updateUser({ accentTheme: theme });
    }
    const themeNames: Record<AccentTheme, string> = {
      emerald: 'Emerald Matrix',
      violet: 'Neon Violet',
      blue: 'Electric Blue',
    };
    addToast('Accent Theme Updated', `${themeNames[theme]} applied successfully.`, 'success');
  };

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

  const refreshMarkets = async () => {
    const res = await fetchLiveMarketTickers();
    setMarkets(res.markets);
    setIsMarketsLive(res.isLive);
    setLastMarketUpdate(res.lastUpdated);
  };

  useEffect(() => {
    refreshMarkets();
    const interval = setInterval(() => {
      refreshMarkets();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Mining simulated progress loop
  useEffect(() => {
    if (miningSession.status !== 'ACTIVE') return;

    const timer = setInterval(() => {
      setMiningSession((prev) => {
        const deltaSeconds = 2;
        const rewardPerSec = 0.000162 / 86400;
        const newEstimated = prev.todayEstimatedRewardCoin + rewardPerSec * deltaSeconds;
        const currentBtcPrice = markets.find(m => m.symbol === 'BTC')?.price || 94250;
        
        return {
          ...prev,
          uptimeSeconds: prev.uptimeSeconds + deltaSeconds,
          todayEstimatedRewardCoin: Number(newEstimated.toFixed(8)),
          todayEstimatedRewardUSD: Number((newEstimated * currentBtcPrice).toFixed(2)),
          acceptedShares: prev.acceptedShares + (Math.random() > 0.6 ? 1 : 0),
          temperatureC: Number((58.0 + (Math.random() * 1.5)).toFixed(1)),
        };
      });
    }, 2000);

    return () => clearInterval(timer);
  }, [miningSession.status, markets]);

  const toggleMining = () => {
    if (miningSession.status === 'ACTIVE') {
      setMiningSession((prev) => ({
        ...prev,
        status: 'PAUSED',
      }));
      addToast('Mining Paused', 'Cloud hash allocation temporarily paused.', 'warning');
    } else {
      setMiningSession((prev) => ({
        ...prev,
        status: 'ACTIVE',
        startedAt: new Date().toISOString(),
      }));
      addToast('Mining Activated', 'Cloud miner reconnected to Nexora Global Stratum.', 'success');
    }
  };

  const setHardwareProfile = (profile: 'Eco' | 'Balanced' | 'Turbo Overclock') => {
    let multiplier = 1.0;
    let power = 16.2;
    if (profile === 'Eco') {
      multiplier = 0.85;
      power = 13.8;
    } else if (profile === 'Turbo Overclock') {
      multiplier = 1.25;
      power = 19.5;
    }

    setMiningSession((prev) => ({
      ...prev,
      hardwareProfile: profile,
      hashrateTHs: Number((124.8 * multiplier).toFixed(1)),
      efficiencyWTH: power,
    }));
    addToast('Hardware Profile Applied', `Switched mode to ${profile}.`, 'info');
  };

  const claimDailyReward = (day: number) => {
    const target = dailyRewards.find((d) => d.day === day);
    if (!target) return;
    if (target.isClaimed) {
      addToast('Already Claimed', `Day ${day} streak reward was already claimed.`, 'warning');
      return;
    }

    // Trigger celebratory confetti
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
        if (d.day === day) return { ...d, isClaimed: true };
        if (d.day === day + 1) return { ...d, isToday: true };
        return d;
      })
    );

    // Credit USDT balance
    setWalletAssets((prev) =>
      prev.map((asset) => {
        if (asset.symbol === 'USDT') {
          return { ...asset, balance: Number((asset.balance + target.rewardUSD).toFixed(2)) };
        }
        return asset;
      })
    );

    // Record transaction
    const newTx: Transaction = {
      id: 'tx-' + Date.now().toString().slice(-5),
      type: 'TASK_REWARD',
      asset: 'USDT',
      amount: target.rewardUSD,
      amountUSD: target.rewardUSD,
      fee: 0,
      status: 'COMPLETED',
      timestamp: new Date().toISOString(),
      note: `Daily Streak Day ${day} Check-in Bonus`,
    };
    setTransactions((prev) => [newTx, ...prev]);

    addToast('Streak Bonus Claimed!', `+$${target.rewardUSD.toFixed(2)} USDT added to your wallet.`, 'success');
  };

  const claimTaskReward = (taskId: string) => {
    const task = earnTasks.find((t) => t.id === taskId);
    if (!task) return;
    if (task.status === 'CLAIMED') {
      addToast('Already Claimed', 'This bounty was already claimed.', 'info');
      return;
    }

    setEarnTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: 'CLAIMED' } : t))
    );

    setWalletAssets((prev) =>
      prev.map((asset) => {
        if (asset.symbol === task.rewardAsset) {
          return { ...asset, balance: Number((asset.balance + task.rewardUSD).toFixed(2)) };
        }
        return asset;
      })
    );

    const newTx: Transaction = {
      id: 'tx-' + Date.now().toString().slice(-5),
      type: 'TASK_REWARD',
      asset: task.rewardAsset,
      amount: task.rewardUSD,
      amountUSD: task.rewardUSD,
      fee: 0,
      status: 'COMPLETED',
      timestamp: new Date().toISOString(),
      note: `Bounty: ${task.title}`,
    };
    setTransactions((prev) => [newTx, ...prev]);

    try {
      confetti({ particleCount: 50, spread: 50, origin: { y: 0.7 } });
    } catch {
      // ignore
    }

    addToast('Bounty Claimed!', `+$${task.rewardUSD.toFixed(2)} ${task.rewardAsset} credited.`, 'success');
  };

  const submitDepositRequest = (assetSymbol: string, network: string, amount: number, txHash: string) => {
    if (!amount || amount <= 0) {
      return { success: false, message: 'Deposit amount must be greater than zero.' };
    }
    if (!txHash || txHash.trim().length < 8) {
      return { success: false, message: 'Please provide a valid transaction hash (TxID).' };
    }

    const asset = walletAssets.find((a) => a.symbol === assetSymbol);
    const amountUSD = Number((amount * (asset?.usdRate || 1)).toFixed(2));

    const newTx: Transaction = {
      id: 'tx-' + Date.now().toString().slice(-5),
      type: 'DEPOSIT',
      asset: assetSymbol,
      amount,
      amountUSD,
      fee: 0,
      status: 'PENDING_CONFIRMATION',
      timestamp: new Date().toISOString(),
      network,
      txHash: txHash.trim(),
      note: 'Pending Blockchain Node Confirmations (3/12)',
    };

    setTransactions((prev) => [newTx, ...prev]);
    addToast('Deposit Submitted', `Request for ${amount} ${assetSymbol} is queued for node confirmation.`, 'info');
    return { success: true, message: 'Deposit submitted. Status is pending node confirmation.' };
  };

  const submitWithdrawalRequest = (assetSymbol: string, network: string, amount: number, address: string) => {
    const asset = walletAssets.find((a) => a.symbol === assetSymbol);
    if (!asset) {
      return { success: false, message: 'Asset not found.' };
    }
    if (amount < asset.minWithdraw) {
      return { success: false, message: `Minimum withdrawal is ${asset.minWithdraw} ${asset.symbol}.` };
    }
    if (amount > asset.balance) {
      return { success: false, message: 'Insufficient available balance.' };
    }
    if (!address || address.length < 16) {
      return { success: false, message: 'Please provide a valid wallet address.' };
    }

    // Deduct available balance and hold in locked balance
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
    const newTx: Transaction = {
      id: 'tx-' + Date.now().toString().slice(-5),
      type: 'WITHDRAWAL',
      asset: assetSymbol,
      amount,
      amountUSD,
      fee: asset.withdrawFee,
      status: 'PENDING_REVIEW',
      timestamp: new Date().toISOString(),
      network,
      toAddress: address,
      note: 'Awaiting Automated Compliance & Signer Node',
    };

    setTransactions((prev) => [newTx, ...prev]);
    addToast('Withdrawal Queued', `Requested withdrawal of ${amount} ${assetSymbol}. Under compliance review.`, 'warning');
    return { success: true, message: 'Withdrawal submitted for automated security review.' };
  };

  const submitPlanOrder = (planName: string, priceUSD: number) => {
    // Check USDT balance
    const usdt = walletAssets.find((a) => a.symbol === 'USDT');
    if (!usdt || usdt.balance < priceUSD) {
      return { success: false, message: `Insufficient USDT balance ($${priceUSD} required). Please deposit USDT first.` };
    }

    setWalletAssets((prev) =>
      prev.map((a) => (a.symbol === 'USDT' ? { ...a, balance: Number((a.balance - priceUSD).toFixed(2)) } : a))
    );

    // Boost hashrate
    setMiningSession((prev) => ({
      ...prev,
      hashrateTHs: Number((prev.hashrateTHs + 50).toFixed(1)),
    }));

    const newTx: Transaction = {
      id: 'tx-' + Date.now().toString().slice(-5),
      type: 'MINING_PAYOUT',
      asset: 'USDT',
      amount: priceUSD,
      amountUSD: priceUSD,
      fee: 0,
      status: 'COMPLETED',
      timestamp: new Date().toISOString(),
      note: `Hashrate Contract Allocation: ${planName}`,
    };
    setTransactions((prev) => [newTx, ...prev]);

    addToast('Plan Activated!', `Allocated hashpower for ${planName}.`, 'success');
    return { success: true, message: 'Cloud hashrate plan activated successfully!' };
  };

  const loginUser = async (email: string, pass: string) => {
    const logged = await AuthService.login(email, pass);
    setUser(logged);
    setAuthModalOpen(false);
    addToast('Welcome Back', `Logged in as ${logged.displayName || logged.email}`, 'success');
  };

  const registerUser = async (email: string, pass: string, name?: string, ref?: string) => {
    const registered = await AuthService.register(email, pass, name, ref);
    setUser(registered);
    setAuthModalOpen(false);
    addToast('Account Created', 'Registration successful! Verification email sent.', 'success');
  };

  const logoutUser = async () => {
    await AuthService.logout();
    setUser(null);
    addToast('Signed Out', 'You have been logged out of your session.', 'info');
  };

  const updateUser = (updates: Partial<UserProfile>) => {
    const updated = AuthService.updateUser(updates);
    setUser({ ...updated });
    addToast('Profile Updated', 'Your profile details have been saved.', 'success');
  };

  const openAuthModal = (mode: 'login' | 'register' | 'forgot' = 'login') => {
    setAuthModalMode(mode);
    setAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setAuthModalOpen(false);
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
        lastMarketUpdate,
        refreshMarkets,
        miningSession,
        toggleMining,
        setHardwareProfile,
        walletAssets,
        transactions,
        dailyRewards,
        earnTasks,
        claimDailyReward,
        claimTaskReward,
        submitDepositRequest,
        submitWithdrawalRequest,
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
