import React, { useState, useEffect, Fragment } from 'react';
import { createPortal } from 'react-dom';

// Dialog Root Component
interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export const Dialog: React.FC<DialogProps> = ({ 
  open, 
  onOpenChange,
  children 
}) => {
  // State to track if we're in a browser environment
  const [mounted, setMounted] = useState(false);

  // Mount check for SSR compatibility
  useEffect(() => {
    setMounted(true);
    
    // Add keyboard event listener for Escape key
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onOpenChange(false);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    
    // Body scroll lock when dialog is open
    if (open) {
      document.body.style.overflow = 'hidden';
    }
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, onOpenChange]);

  // Handle clicking on the backdrop
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onOpenChange(false);
    }
  };

  if (!mounted || !open) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black bg-opacity-50"
      onClick={handleBackdropClick}
    >
      {children}
    </div>,
    document.body
  );
};

// Dialog Content Component
interface DialogContentProps {
  className?: string;
  children: React.ReactNode;
}

export const DialogContent: React.FC<DialogContentProps> = ({ 
  className = '',
  children 
}) => {
  return (
    <div 
      className={`relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6 ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
};

// Dialog Header Component
interface DialogHeaderProps {
  className?: string;
  children: React.ReactNode;
}

export const DialogHeader: React.FC<DialogHeaderProps> = ({ 
  className = '',
  children 
}) => {
  return (
    <div className={`mb-4 ${className}`}>
      {children}
    </div>
  );
};

// Dialog Title Component
interface DialogTitleProps {
  className?: string;
  children: React.ReactNode;
}

export const DialogTitle: React.FC<DialogTitleProps> = ({ 
  className = '',
  children 
}) => {
  return (
    <h2 className={`text-lg font-semibold leading-none tracking-tight ${className}`}>
      {children}
    </h2>
  );
};

// Dialog Footer Component
interface DialogFooterProps {
  className?: string;
  children: React.ReactNode;
}

export const DialogFooter: React.FC<DialogFooterProps> = ({ 
  className = '',
  children 
}) => {
  return (
    <div className={`flex justify-end space-x-2 mt-6 ${className}`}>
      {children}
    </div>
  );
};

export default {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
}; 