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
  isAdmin?: boolean;
}

export type MarketConnectionStatus = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR';

export type KlineInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w';

export interface KlineCandle {
  time: number; // UNIX timestamp in seconds (UTC)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number; // Base asset volume
  quoteVolume: number; // Quote asset (USDT) volume
  isFinal?: boolean;
}

export interface CryptoMarket {
  symbol: string; // e.g., 'BTC'
  pair: string; // e.g., 'BTCUSDT'
  displayPair: string; // e.g., 'BTC/USDT'
  name: string;
  price: number;
  priceChange24h: number;
  change24h: number; // percentage change 24h
  high24h: number;
  low24h: number;
  volume24h: number; // 24h Quote Volume (USDT)
  baseVolume24h: number; // 24h Base Asset Volume
  lastUpdated: string;
  tickDirection?: 'up' | 'down' | 'neutral';
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
  userId?: string;
  planId?: string;
  lastSessionId?: string;
  updatedAt?: string;
  isSimulated?: boolean;
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
export type TransactionStatus = 'COMPLETED' | 'PENDING_CONFIRMATION' | 'PENDING_REVIEW' | 'PROCESSING' | 'FAILED' | 'REJECTED';

export interface Transaction {
  id: string;
  type: TransactionType;
  asset: string;
  amount: number;
  amountUSD: number;
  fee: number;
  netPayoutAmount?: number;
  status: TransactionStatus;
  timestamp: string;
  txHash?: string;
  payoutTxHash?: string;
  network?: string;
  toAddress?: string;
  fromAddress?: string;
  note?: string;
  userId?: string;
  isDemo?: boolean;
  approvedBy?: string;
  approvedByUid?: string;
  approvedAt?: string;
  approvalNote?: string;
  creditedAmount?: number;
  creditedAsset?: string;
  walletCredited?: boolean;
  walletSettled?: boolean;
  reservedFromBalance?: boolean;
  refunded?: boolean;
  refundedAt?: string;
  settlementId?: string;
  settlementStatus?: 'CREDITED' | 'PAID' | 'REFUNDED' | 'REJECTED';
  rejectedBy?: string;
  rejectedByUid?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  claimDate?: string;
  rewardDay?: string | number;
  streakDay?: number;
  taskId?: string;
  rewardSource?: 'DAILY_STREAK' | 'TASK_BOUNTY';
  metadataBackfilledFrom?: string;
  updatedAt?: string;
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
  claimedAt?: string;
  status?: 'PENDING_VERIFICATION' | 'CLAIMED' | 'REJECTED' | 'LOCKED' | 'SIMULATED';
}

export interface DailyStreakClaimItem {
  day: number;
  date: string;
  rewardUSD: number;
  status: 'PENDING_VERIFICATION' | 'CLAIMED' | 'REJECTED' | 'SIMULATED';
  timestamp: string;
  txId?: string;
}

export interface DailyStreakRecord {
  userId: string;
  currentStreak: number;
  lastClaimDate: string; // YYYY-MM-DD (UTC)
  lastClaimTimestamp: string;
  lastClaimTxId?: string;
  totalClaims: number;
  claimStatus: 'PENDING_VERIFICATION' | 'CLAIMED' | 'REJECTED' | 'SIMULATED';
  approvalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
  approvedAmount?: number;
  verifiedBy?: string;
  verifiedAt?: string;
  walletCredited?: boolean;
  claimHistory: DailyStreakClaimItem[];
  updatedAt?: string;
}
