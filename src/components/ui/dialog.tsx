"use client";

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

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
  return <>{children}</>;
};

export const DialogTrigger: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <>{children}</>;
};

export const DialogPortal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <>{children}</>;
};

export const DialogClose: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <>{children}</>;
};

export const DialogOverlay: React.FC<{ className?: string }> = ({ className }) => {
  return <div className={`fixed inset-0 z-50 bg-black/80 ${className || ''}`} />;
};

interface DialogContentProps {
  className?: string;
  children: React.ReactNode;
}

export const DialogContent: React.FC<DialogContentProps> = ({ 
  className = '',
  children 
}) => {
  const [isMounted, setIsMounted] = useState(false);
  
  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);
  
  if (!isMounted) return null;
  
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto">
      <div className="fixed inset-0 bg-black bg-opacity-50" />
      <div className={`relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6 ${className}`}>
        {children}
      </div>
    </div>,
    document.body
  );
};

export const DialogHeader: React.FC<{ 
  className?: string;
  children: React.ReactNode;
}> = ({ className = '', children }) => {
  return <div className={`mb-4 ${className}`}>{children}</div>;
};

export const DialogFooter: React.FC<{ 
  className?: string;
  children: React.ReactNode;
}> = ({ className = '', children }) => {
  return <div className={`flex justify-end space-x-2 mt-6 ${className}`}>{children}</div>;
};

export const DialogTitle: React.FC<{ 
  className?: string;
  children: React.ReactNode;
}> = ({ className = '', children }) => {
  return <h2 className={`text-lg font-semibold ${className}`}>{children}</h2>;
};

export const DialogDescription: React.FC<{ 
  className?: string;
  children: React.ReactNode;
}> = ({ className = '', children }) => {
  return <p className={`text-sm text-gray-500 ${className}`}>{children}</p>;
}; 