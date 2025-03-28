import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'link';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  className?: string;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'default',
  size = 'md',
  children,
  className = '',
  ...props
}) => {
  const getVariantClasses = () => {
    switch (variant) {
      case 'outline':
        return 'border border-gray-300 text-gray-700 hover:bg-gray-50 focus:ring-gray-500';
      case 'ghost':
        return 'text-gray-600 hover:bg-gray-100 focus:ring-gray-500';
      case 'link':
        return 'text-primary hover:underline p-0 h-auto shadow-none focus:ring-primary';
      default:
        return 'bg-primary text-white hover:bg-primary-dark focus:ring-primary';
    }
  };

  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return 'px-2 py-1 text-xs';
      case 'lg':
        return 'px-6 py-3 text-base';
      default:
        return 'px-4 py-2 text-sm';
    }
  };

  const baseClasses = 'font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 transition-colors';
  const allClasses = `${baseClasses} ${getVariantClasses()} ${getSizeClasses()} ${className}`;

  return (
    <button className={allClasses} {...props}>
      {children}
    </button>
  );
};

export default Button; 