import React from 'react';
import { useRouter } from 'next/navigation';
import { useSupabase } from '../providers/SupabaseProvider';

interface HeaderProps {
  title: string;
}

const Header: React.FC<HeaderProps> = ({ title }) => {
  const { user, signOut } = useSupabase();
  const router = useRouter();

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="container mx-auto px-4 py-4 flex justify-between items-center">
        <div className="flex items-center">
          <h1 className="text-xl font-bold text-gray-800">{title}</h1>
        </div>
        
        <div className="flex items-center space-x-4">
          {user && (
            <>
              <span className="text-sm text-gray-600">{user.email}</span>
              <button 
                onClick={() => signOut()}
                className="text-sm px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-md text-gray-700"
              >
                Abmelden
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header; 