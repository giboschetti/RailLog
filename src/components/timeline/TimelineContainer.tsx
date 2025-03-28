import React from 'react';

interface TimelineContainerProps {
  children?: React.ReactNode;
}

const TimelineContainer: React.FC<TimelineContainerProps> = ({ children }) => {
  return (
    <div className="w-full overflow-x-auto bg-white rounded-lg shadow p-4">
      <div className="flex items-center mb-4">
        <h2 className="text-xl font-semibold">Zeitachse</h2>
        <div className="ml-auto flex space-x-2">
          <button className="px-3 py-1 bg-primary text-white text-sm rounded">
            Heute
          </button>
          <button className="px-3 py-1 bg-gray-200 text-gray-700 text-sm rounded">
            Filter
          </button>
        </div>
      </div>
      
      <div className="relative min-h-[400px] border border-gray-200 rounded">
        {/* Timeline content will go here */}
        <div className="absolute top-0 left-0 right-0 h-10 border-b border-gray-200 flex items-center px-4 bg-gray-50">
          <div className="grid grid-cols-24 w-full">
            {Array.from({ length: 24 }).map((_, i) => (
              <div key={i} className="text-xs text-gray-500 text-center">
                {i}:00
              </div>
            ))}
          </div>
        </div>
        
        <div className="mt-10 p-4">
          {children || (
            <div className="flex items-center justify-center h-64 text-gray-400">
              Keine Daten zur Anzeige vorhanden
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TimelineContainer; 