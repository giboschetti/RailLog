'use client';

import { useRouter } from 'next/navigation';
import { useSupabase } from '@/components/providers/SupabaseProvider';

export default function Home() {
  const router = useRouter();
  const { user, isLoading, signOut } = useSupabase();

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-primary">
          Rail Log
        </h1>
        <div>
          {isLoading ? (
            <span className="text-gray-500">Lade...</span>
          ) : user ? (
            <div className="flex items-center space-x-4">
              <span className="text-gray-600">{user.email}</span>
              <button 
                onClick={signOut}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                Abmelden
              </button>
            </div>
          ) : (
            <button 
              onClick={() => router.push('/login')}
              className="px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark"
            >
              Anmelden
            </button>
          )}
        </div>
      </div>

      <p className="text-lg mb-6">
        Willkommen bei Rail Log - Ihrer Anwendung für Logistikmanagement im Bahnbau.
      </p>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <p className="text-gray-500">Lade Inhalte...</p>
        </div>
      ) : user ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <div className="p-6 bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
            <h3 className="text-xl font-semibold mb-2">Zeitachse</h3>
            <p className="text-gray-600 mb-4">Visualisierung von Gleisen und Waggons auf der Zeitachse</p>
            <button 
              onClick={() => router.push('/timeline')}
              className="px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark"
            >
              Öffnen
            </button>
          </div>
          
          <div className="p-6 bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
            <h3 className="text-xl font-semibold mb-2">Projekte</h3>
            <p className="text-gray-600 mb-4">Verwaltung von Projekten und Logistikknoten</p>
            <button 
              onClick={() => router.push('/projects')}
              className="px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark"
            >
              Öffnen
            </button>
          </div>
          
          <div className="p-6 bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
            <h3 className="text-xl font-semibold mb-2">Restriktionen</h3>
            <p className="text-gray-600 mb-4">Verwaltung von Restriktionen für Ein- und Ausfahrten</p>
            <button 
              onClick={() => router.push('/restrictions')}
              className="px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark"
            >
              Öffnen
            </button>
          </div>
        </div>
      ) : (
        <div className="p-6 bg-white rounded-lg shadow-sm border border-gray-200">
          <h2 className="text-xl font-semibold mb-4">Bitte anmelden</h2>
          <p className="text-gray-600 mb-4">
            Melden Sie sich an, um auf alle Funktionen der Rail Log-Anwendung zuzugreifen.
          </p>
          <button 
            onClick={() => router.push('/login')}
            className="px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark"
          >
            Zum Login
          </button>
        </div>
      )}

      <div className="p-6 bg-white rounded-lg shadow-sm border border-gray-200 mt-6">
        <h2 className="text-xl font-semibold mb-2">Funktionen</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Visualisierung von Gleisen und Waggons auf einer Zeitachse</li>
          <li>Verwaltung von Logistikknoten und Bewegungen</li>
          <li>Planung und Überwachung von Transportbewegungen</li>
          <li>Verwaltung von Restriktionen und Kapazitäten</li>
        </ul>
      </div>
    </div>
  );
} 