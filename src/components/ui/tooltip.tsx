"use client";

import React, { useState, useRef, useEffect } from 'react';

export const TooltipProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <>{children}</>;
};

export const Tooltip: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <>{children}</>;
};

interface TooltipTriggerProps {
  asChild?: boolean;
  children: React.ReactNode;
}

export const TooltipTrigger: React.FC<TooltipTriggerProps> = ({ children, asChild }) => {
  return <>{children}</>;
};

interface TooltipContentProps {
  children: React.ReactNode;
  className?: string;
}

export const TooltipContent: React.FC<TooltipContentProps> = ({ children, className }) => {
  return (
    <div className={`absolute z-50 bg-white rounded-md p-2 shadow-md text-sm ${className || ''}`}>
      {children}
    </div>
  );
}; 