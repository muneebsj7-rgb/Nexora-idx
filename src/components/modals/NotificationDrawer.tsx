import { X, Bell, CheckCircle2, ShieldAlert, Cpu, Sparkles } from 'lucide-react';
import { GradientIcon } from '../ui/GradientIcon';

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const notifications = [
    {
      id: 'notif-1',
      title: 'Daily Cloud Mining Share Distributed',
      message: '0.000155 BTC (~$14.60) credited from your active BTC cloud mining contract.',
      time: '4 hours ago',
      type: 'payout',
      read: false,
    },
    {
      id: 'notif-2',
      title: 'Hashrate Status Report',
      message: 'Cloud mining session operating normally. All active BTC contracts are online.',
      time: '12 hours ago',
      type: 'system',
      read: true,
    },
    {
      id: 'notif-3',
      title: 'Referral Commission Added',
      message: 'New active miner joined via your code NEXO-9842. +$15.00 USDT added.',
      time: '16 hours ago',
      type: 'referral',
      read: true,
    },
    {
      id: 'notif-4',
      title: 'Security Notice',
      message: 'Two-factor authentication (2FA) is recommended to protect your withdrawal operations.',
      time: '1 day ago',
      type: 'security',
      read: true,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-[#0D121C] border-l border-[#253144] h-full p-5 shadow-2xl flex flex-col justify-between animate-in slide-in-from-right duration-200">
        <div>
          <div className="flex items-center justify-between pb-4 border-b border-[#253144]">
            <div className="flex items-center gap-2.5">
              <GradientIcon icon={Bell} theme="emerald" size="sm" variant="boxed" />
              <h3 className="font-bold text-[#F4F7FC] text-base">Notifications</h3>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-[#98A6BA] hover:text-[#F4F7FC] rounded-lg hover:bg-[#182232] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mt-4 space-y-3 overflow-y-auto max-h-[calc(100vh-140px)] pr-1">
            {notifications.map((item) => (
              <div
                key={item.id}
                className={`p-3.5 rounded-xl border transition-colors ${
                  !item.read
                    ? 'border-[#00D6A3]/40 bg-[#00D6A3]/10'
                    : 'border-[#253144] bg-[#121925]'
                }`}
              >
                <div className="flex items-start gap-3">
                  {item.type === 'payout' && <GradientIcon icon={CheckCircle2} theme="emerald" size="xs" variant="boxed" className="mt-0.5" />}
                  {item.type === 'system' && <GradientIcon icon={Cpu} theme="cyan" size="xs" variant="boxed" className="mt-0.5" />}
                  {item.type === 'security' && <GradientIcon icon={ShieldAlert} theme="rose" size="xs" variant="boxed" className="mt-0.5" />}
                  {item.type === 'referral' && <GradientIcon icon={Sparkles} theme="gold" size="xs" variant="boxed" className="mt-0.5" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-[#F4F7FC] truncate">{item.title}</p>
                      {!item.read && (
                        <span className="w-2 h-2 rounded-full bg-[#00D6A3] shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-[#98A6BA] mt-1 leading-relaxed">{item.message}</p>
                    <span className="text-[10px] text-[#98A6BA]/70 mt-2 block font-mono">{item.time}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-[#182232] hover:bg-[#253144] text-[#F4F7FC] text-xs font-semibold transition-colors mt-4 border border-[#253144]"
        >
          Close Notifications
        </button>
      </div>
    </div>
  );
};
