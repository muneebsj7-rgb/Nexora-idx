export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  isEmailVerified: boolean;
  kycTier: 'None' | 'Tier 1 (Basic)' | 'Tier 2 (Advanced)';
  createdAt: string;
  avatarUrl?: string;
  referralCode: string;
  referredBy?: string;
  twoFactorEnabled: boolean;
  currency: 'USD' | 'EUR' | 'GBP' | 'JPY';
  accentTheme?: 'emerald' | 'violet' | 'blue' | 'cyan';
  isDemo?: boolean;
  authProvider?: 'firebase' | 'demo';
}

export interface CryptoMarket {
  symbol: string;
  pair: string;
  name: string;
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  marketCap?: number;
  sparkline: number[];
  isPoW: boolean;
  algorithm?: string;
}

export type MiningStatus = 'IDLE' | 'ACTIVE' | 'MAINTENANCE' | 'PAUSED';

export interface MiningSession {
  id: string;
  algorithm: 'SHA-256 (BTC)' | 'Ethash (ETC)' | 'Scrypt (LTC/DOGE)';
  targetCoin: 'BTC' | 'ETC' | 'LTC';
  hashrateTHs: number;
  efficiencyWTH: number;
  temperatureC: number;
  uptimeSeconds: number;
  status: MiningStatus;
  startedAt: string | null;
  todayEstimatedRewardCoin: number;
  todayEstimatedRewardUSD: number;
  confirmedRewardCoin: number;
  poolName: string;
  acceptedShares: number;
  rejectedShares: number;
  hardwareProfile: 'Eco' | 'Balanced' | 'Turbo Overclock';
}

export interface MiningPlan {
  id: string;
  name: string;
  tier: 'Starter' | 'Pro' | 'Enterprise' | 'Custom';
  algorithm: string;
  targetCoin: 'BTC' | 'ETC' | 'LTC';
  hashrate: number;
  hashrateUnit: 'TH/s' | 'GH/s' | 'MH/s';
  priceUSD: number;
  durationDays: number;
  estimatedDailyYieldCoin: number;
  estimatedDailyYieldUSD: number;
  powerConsumptionW: number;
  maintenanceFeePercent: number;
  popular?: boolean;
}

export interface WalletAsset {
  symbol: string;
  name: string;
  balance: number;
  lockedBalance: number;
  usdRate: number;
  iconBg: string;
  networks: string[];
  depositAddress: string;
  minDeposit: number;
  minWithdraw: number;
  withdrawFee: number;
}

export type TransactionType = 'DEPOSIT' | 'WITHDRAWAL' | 'MINING_PAYOUT' | 'REFERRAL_BONUS' | 'TASK_REWARD';
export type TransactionStatus = 'COMPLETED' | 'PENDING_CONFIRMATION' | 'PENDING_REVIEW' | 'PROCESSING' | 'FAILED';

export interface Transaction {
  id: string;
  type: TransactionType;
  asset: string;
  amount: number;
  amountUSD: number;
  fee: number;
  status: TransactionStatus;
  timestamp: string;
  txHash?: string;
  network?: string;
  toAddress?: string;
  fromAddress?: string;
  note?: string;
  userId?: string;
  isDemo?: boolean;
}

export interface EarnTask {
  id: string;
  title: string;
  description: string;
  category: 'Community' | 'Security' | 'Mining' | 'Milestone';
  rewardUSD: number;
  rewardAsset: string;
  status: 'AVAILABLE' | 'IN_PROGRESS' | 'COMPLETED' | 'CLAIMED';
  actionUrl?: string;
}

export interface DailyReward {
  day: number;
  rewardUSD: number;
  isClaimed: boolean;
  isToday: boolean;
}
