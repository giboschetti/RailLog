import React from 'react';

const PageLoading: React.FC = () => {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-gray-500">Lade Daten...</p>
      </div>
    </div>
  );
};

export default PageLoading; 