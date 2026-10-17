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
      message: '0.000155 BTC (~$14.60) credited from SHA-256 Nexora Stratum Pool.',
      time: '4 hours ago',
      type: 'payout',
      read: false,
    },
    {
      id: 'notif-2',
      title: 'Hashrate Stability Report',
      message: 'Cluster FRA01 operating at 99.8% efficiency. Temperature nominal at 58.4°C.',
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
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-slate-900 border-l border-slate-800 h-full p-5 shadow-2xl flex flex-col justify-between animate-in slide-in-from-right duration-200">
        <div>
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <GradientIcon icon={Bell} theme="emerald" size="sm" variant="boxed" />
              <h3 className="font-bold text-white text-base">Notifications</h3>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
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
                    ? 'border-emerald-500/40 bg-emerald-500/5'
                    : 'border-slate-800 bg-slate-950/60'
                }`}
              >
                <div className="flex items-start gap-3">
                  {item.type === 'payout' && <GradientIcon icon={CheckCircle2} theme="emerald" size="xs" variant="boxed" className="mt-0.5" />}
                  {item.type === 'system' && <GradientIcon icon={Cpu} theme="cyan" size="xs" variant="boxed" className="mt-0.5" />}
                  {item.type === 'security' && <GradientIcon icon={ShieldAlert} theme="rose" size="xs" variant="boxed" className="mt-0.5" />}
                  {item.type === 'referral' && <GradientIcon icon={Sparkles} theme="gold" size="xs" variant="boxed" className="mt-0.5" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-white truncate">{item.title}</p>
                      {!item.read && (
                        <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">{item.message}</p>
                    <span className="text-[10px] text-slate-500 mt-2 block font-mono">{item.time}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors mt-4"
        >
          Close Notifications
        </button>
      </div>
    </div>
  );
};
