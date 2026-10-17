import { DailyReward, EarnTask } from '../types';

export const INITIAL_DAILY_REWARDS: DailyReward[] = [
  { day: 1, rewardUSD: 0.50, isClaimed: true, isToday: false },
  { day: 2, rewardUSD: 0.75, isClaimed: true, isToday: false },
  { day: 3, rewardUSD: 1.00, isClaimed: true, isToday: false },
  { day: 4, rewardUSD: 1.50, isClaimed: false, isToday: true },
  { day: 5, rewardUSD: 2.00, isClaimed: false, isToday: false },
  { day: 6, rewardUSD: 3.00, isClaimed: false, isToday: false },
  { day: 7, rewardUSD: 5.00, isClaimed: false, isToday: false },
];

export const INITIAL_EARN_TASKS: EarnTask[] = [
  {
    id: 'task_telegram',
    title: 'Join Nexora Official Telegram',
    description: 'Join our community for daily mining tips, pool updates, and promo codes.',
    category: 'Community',
    rewardUSD: 2.00,
    rewardAsset: 'USDT',
    status: 'AVAILABLE',
    actionUrl: 'https://t.me/nexoramine',
  },
  {
    id: 'task_2fa',
    title: 'Enable Two-Factor Authentication (2FA)',
    description: 'Enhance your mining account security with Google Authenticator or SMS 2FA.',
    category: 'Security',
    rewardUSD: 3.00,
    rewardAsset: 'USDT',
    status: 'AVAILABLE',
  },
  {
    id: 'task_verify_email',
    title: 'Complete Email Verification',
    description: 'Verify your primary email address to unlock higher withdrawal limits.',
    category: 'Security',
    rewardUSD: 1.50,
    rewardAsset: 'USDT',
    status: 'COMPLETED',
  },
  {
    id: 'task_mine_24h',
    title: 'Maintain 24h Continuous Mining Session',
    description: 'Keep your cloud hash power online for at least 24 consecutive hours.',
    category: 'Mining',
    rewardUSD: 5.00,
    rewardAsset: 'USDT',
    status: 'IN_PROGRESS',
  },
  {
    id: 'task_refer_friend',
    title: 'Invite Your First Active Miner',
    description: 'Share your referral code. Receive 5% hashrate bonus when they start.',
    category: 'Milestone',
    rewardUSD: 10.00,
    rewardAsset: 'USDT',
    status: 'AVAILABLE',
  }
];
