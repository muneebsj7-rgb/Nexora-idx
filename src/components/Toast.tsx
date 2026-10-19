import React from 'react';
import { useApp } from '../context/AppContext';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0">
      {toasts.map((toast) => {
        let icon = <Info className="w-5 h-5 text-[#25B9F3] shrink-0" />;
        let borderColor = 'border-[#25B9F3]/30';
        let bgGradient = 'from-[#121925] to-[#0D121C]';

        if (toast.type === 'success') {
          icon = <CheckCircle2 className="w-5 h-5 text-[#00D6A3] shrink-0" />;
          borderColor = 'border-[#00D6A3]/30';
          bgGradient = 'from-[#121925] to-[#0D121C]';
        } else if (toast.type === 'warning') {
          icon = <AlertTriangle className="w-5 h-5 text-[#F3B64B] shrink-0" />;
          borderColor = 'border-[#F3B64B]/30';
          bgGradient = 'from-[#121925] to-[#0D121C]';
        } else if (toast.type === 'error') {
          icon = <AlertCircle className="w-5 h-5 text-[#FF647C] shrink-0" />;
          borderColor = 'border-[#FF647C]/30';
          bgGradient = 'from-[#121925] to-[#0D121C]';
        }

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-2xl border ${borderColor} bg-gradient-to-r ${bgGradient} backdrop-blur-md shadow-2xl text-[#F4F7FC] transition-all duration-300 animate-in slide-in-from-top-2`}
          >
            {icon}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold tracking-tight">{toast.title}</p>
              <p className="text-xs text-[#98A6BA] mt-0.5 leading-relaxed">{toast.message}</p>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-[#98A6BA] hover:text-[#F4F7FC] p-1 rounded-lg hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
