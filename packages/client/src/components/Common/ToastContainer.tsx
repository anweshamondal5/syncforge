import React from 'react';
import { useToast, ToastType } from '../../context/ToastContext';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  const getIcon = (type: ToastType) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />;
      case 'info':
      default:
        return <Info className="w-5 h-5 text-sky-500 flex-shrink-0" />;
    }
  };

  const getBorderColor = (type: ToastType) => {
    switch (type) {
      case 'success':
        return 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/90 dark:bg-emerald-950/80 text-emerald-950 dark:text-emerald-100';
      case 'error':
        return 'border-rose-200 dark:border-rose-800/60 bg-rose-50/90 dark:bg-rose-950/80 text-rose-950 dark:text-rose-100';
      case 'warning':
        return 'border-amber-200 dark:border-amber-800/60 bg-amber-50/90 dark:bg-amber-950/80 text-amber-950 dark:text-amber-100';
      case 'info':
      default:
        return 'border-sky-200 dark:border-sky-800/60 bg-sky-50/90 dark:bg-sky-950/80 text-sky-950 dark:text-sky-100';
    }
  };

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none p-2"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-2xl border shadow-lg backdrop-blur-md transition-all animate-in fade-in slide-in-from-bottom-3 duration-200 ${getBorderColor(
            toast.type
          )}`}
        >
          {getIcon(toast.type)}
          <div className="flex-1 min-w-0">
            <h5 className="text-xs font-bold leading-tight">{toast.title}</h5>
            {toast.message && <p className="text-xs opacity-90 mt-0.5 leading-snug">{toast.message}</p>}
          </div>
          <button
            onClick={() => removeToast(toast.id)}
            title="Dismiss notification"
            className="p-1 rounded-lg opacity-60 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
