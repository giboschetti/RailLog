import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/components/providers/SupabaseProvider';

interface AuthFormProps {
  mode?: 'signin' | 'signup';
}

const AuthForm: React.FC<AuthFormProps> = ({ mode = 'signin' }) => {
  const router = useRouter();
  const { supabase } = useSupabase();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;
        
        setMessage({ text: 'Erfolgreich angemeldet', type: 'success' });
        
        // Set redirecting state and redirect after a short delay
        setRedirecting(true);
        setTimeout(() => {
          router.push('/');
          router.refresh();
        }, 1500);
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              role: 'viewer', // Default role for new users
            },
          },
        });

        if (error) throw error;
        setMessage({ 
          text: 'Registrierung erfolgreich. Bitte überprüfen Sie Ihre E-Mails für die Bestätigung.', 
          type: 'success' 
        });
      }
    } catch (error: any) {
      setMessage({ 
        text: error.message || 'Ein Fehler ist aufgetreten', 
        type: 'error' 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md w-full mx-auto bg-white p-8 rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-center">
        {mode === 'signin' ? 'Anmelden' : 'Registrieren'}
      </h2>
      
      <form onSubmit={handleAuth} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            E-Mail
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            required
          />
        </div>
        
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            Passwort
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            required
          />
        </div>
        
        {message && (
          <div className={`p-3 rounded ${
            message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}>
            {message.text}
            {redirecting && (
              <div className="mt-2">
                <p className="text-sm">Sie werden weitergeleitet...</p>
              </div>
            )}
          </div>
        )}
        
        <button
          type="submit"
          disabled={loading || redirecting}
          className={`w-full py-2 px-4 bg-primary text-white rounded-md ${
            (loading || redirecting) ? 'opacity-70 cursor-not-allowed' : 'hover:bg-primary-dark'
          }`}
        >
          {loading 
            ? 'Verarbeitung...' 
            : redirecting 
              ? 'Weiterleitung...'
              : mode === 'signin' ? 'Anmelden' : 'Registrieren'
          }
        </button>
      </form>
    </div>
  );
};

export default AuthForm; 