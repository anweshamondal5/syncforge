import React, { createContext, useContext, useState, useCallback } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  title: string;
  message?: string;
  type: ToastType;
  duration?: number;
}

interface ToastContextType {
  toasts: Toast[];
  showToast: (title: string, options?: { message?: string; type?: ToastType; duration?: number }) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (title: string, options?: { message?: string; type?: ToastType; duration?: number }) => {
      const id = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const newToast: Toast = {
        id,
        title,
        message: options?.message,
        type: options?.type || 'info',
        duration: options?.duration || 4000,
      };

      setToasts((prev) => [...prev.slice(-4), newToast]);

      if (newToast.duration && newToast.duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, newToast.duration);
      }
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ toasts, showToast, removeToast }}>
      {children}
    </ToastContext.Provider>
  );
};

const defaultToastContext: ToastContextType = {
  toasts: [],
  showToast: () => {},
  removeToast: () => {},
};

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  return context || defaultToastContext;
};
