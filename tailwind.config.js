/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#3B82F6', // Blue for primary actions
          dark: '#2563EB',
        },
        secondary: {
          DEFAULT: '#10B981', // Green for secondary actions
          dark: '#059669',
        },
        warning: {
          DEFAULT: '#F59E0B', // Amber for warnings/restrictions
          dark: '#D97706',
        },
        danger: {
          DEFAULT: '#EF4444', // Red for errors/critical alerts
          dark: '#DC2626',
        },
      },
    },
  },
  plugins: [],
} 