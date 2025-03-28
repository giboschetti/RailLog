'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/components/providers/SupabaseProvider';
import AuthForm from '@/components/auth/AuthForm';

export default function LoginPage() {
  const { user, isLoading } = useSupabase();
  const router = useRouter();
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  
  // Redirect if already logged in
  useEffect(() => {
    if (user && !isLoading) {
      router.push('/');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Lade...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Rail Log</h1>
          <p className="text-gray-600">
            Webbasierte App für Logistikmanagement im Bahnbau
          </p>
        </div>

        <AuthForm mode={authMode} />
        
        <div className="mt-4 text-center">
          <button 
            onClick={() => setAuthMode(authMode === 'signin' ? 'signup' : 'signin')}
            className="text-primary hover:underline text-sm"
          >
            {authMode === 'signin' 
              ? 'Noch kein Konto? Registrieren' 
              : 'Bereits ein Konto? Anmelden'}
          </button>
        </div>
      </div>
    </div>
  );
} 