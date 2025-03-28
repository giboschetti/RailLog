"use client";

import * as React from 'react';

type ToastProps = {
  title?: string;
  description?: string;
  variant?: 'default' | 'destructive';
};

type ToastActionElement = React.ReactElement;

type ToastContext = {
  toast: (props: ToastProps) => void;
  dismiss: (toastId?: string) => void;
};

const ToastContext = React.createContext<ToastContext | null>(null);

export function ToastProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [toasts, setToasts] = React.useState<ToastProps[]>([]);

  const toast = React.useCallback((props: ToastProps) => {
    setToasts((prev) => [...prev, props]);
    
    // Auto dismiss after 3 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t !== props));
    }, 3000);
  }, []);

  const dismiss = React.useCallback((toastId?: string) => {
    setToasts((prev) => {
      if (toastId) {
        return prev.filter((t) => t !== prev.find((toast) => toast.title === toastId));
      }
      return [];
    });
  }, []);

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <div className="fixed bottom-0 right-0 z-50 p-4 space-y-4 w-full max-w-md">
        {toasts.map((t, i) => (
          <div
            key={i}
            className={`rounded-md p-4 shadow-md ${
              t.variant === 'destructive'
                ? 'bg-red-100 text-red-900'
                : 'bg-white text-gray-900'
            }`}
          >
            {t.title && <h3 className="font-medium">{t.title}</h3>}
            {t.description && <p className="text-sm mt-1">{t.description}</p>}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => {
  const context = React.useContext(ToastContext);
  
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  
  return context;
};

// Create a simpler version of toast that can be imported and used directly without hooks
const createToast = (props: ToastProps) => {
  // Create a simple toast notification that doesn't rely on hooks or context
  const toastContainer = document.createElement('div');
  toastContainer.className = `fixed bottom-4 right-4 z-50 p-4 rounded-md shadow-md ${
    props.variant === 'destructive'
      ? 'bg-red-100 text-red-900'
      : 'bg-white text-gray-900'
  }`;
  
  if (props.title) {
    const title = document.createElement('h3');
    title.className = 'font-medium';
    title.textContent = props.title;
    toastContainer.appendChild(title);
  }
  
  if (props.description) {
    const description = document.createElement('p');
    description.className = 'text-sm mt-1';
    description.textContent = props.description;
    toastContainer.appendChild(description);
  }
  
  document.body.appendChild(toastContainer);
  
  setTimeout(() => {
    toastContainer.remove();
  }, 3000);
};

export const toast = Object.assign(
  createToast,
  { custom: createToast }
); 