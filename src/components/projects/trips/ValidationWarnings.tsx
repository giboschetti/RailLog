import React from 'react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, AlertTriangle, Clock, ArrowRight } from 'lucide-react';
import { ValidationWarning } from '@/lib/tripValidation';

interface ValidationWarningsProps {
  warnings: ValidationWarning[];
}

const ValidationWarnings: React.FC<ValidationWarningsProps> = ({ warnings }) => {
  if (warnings.length === 0) return null;

  // Group warnings by type
  const groupedWarnings: Record<string, ValidationWarning[]> = {};
  
  warnings.forEach(warning => {
    const type = warning.type || 'general';
    if (!groupedWarnings[type]) {
      groupedWarnings[type] = [];
    }
    groupedWarnings[type].push(warning);
  });

  return (
    <div className="space-y-4 mb-4">
      <h3 className="text-lg font-semibold">Warnings</h3>
      
      {Object.entries(groupedWarnings).map(([type, typeWarnings]) => (
        <div key={type} className="space-y-2">
          {type !== 'general' && (
            <h4 className="text-md font-medium capitalize">{type.replace('_', ' ')} Warnings</h4>
          )}
          
          {typeWarnings.map((warning, index) => (
            <Alert key={index} variant="warning" className="bg-yellow-50 border-yellow-200">
              {getWarningIcon(warning)}
              <AlertTitle>{getWarningTitle(warning)}</AlertTitle>
              <AlertDescription>{warning.message}</AlertDescription>
              
              {/* Render additional details based on warning type */}
              {warning.type === 'future_trips' && warning.details?.trips && (
                <div className="mt-2 space-y-1">
                  <p className="text-sm font-medium">Affected Trips:</p>
                  <ul className="text-sm space-y-1">
                    {warning.details.trips.slice(0, 3).map((trip: any, i: number) => (
                      <li key={i} className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        <span>
                          {new Date(trip.datetime).toLocaleString()} - {trip.type} trip
                        </span>
                      </li>
                    ))}
                    {warning.details.trips.length > 3 && (
                      <li>...and {warning.details.trips.length - 3} more</li>
                    )}
                  </ul>
                </div>
              )}
              
              {(warning.type === 'source_restriction' || warning.type === 'dest_restriction') && 
               warning.details?.restrictions && (
                <div className="mt-2">
                  <p className="text-sm font-medium">Active Restrictions:</p>
                  <ul className="text-sm">
                    {warning.details.restrictions.slice(0, 3).map((restriction: any, i: number) => (
                      <li key={i} className="flex items-center gap-1">
                        <AlertTriangle className="h-4 w-4" />
                        <span>
                          {restriction.comment || 'No details available'}
                        </span>
                      </li>
                    ))}
                    {warning.details.restrictions.length > 3 && (
                      <li>...and {warning.details.restrictions.length - 3} more</li>
                    )}
                  </ul>
                </div>
              )}
            </Alert>
          ))}
        </div>
      ))}
      
      <p className="text-sm text-gray-600">
        These warnings don't prevent the trip from being created, but may cause operational issues.
        Please review and confirm if you want to proceed despite these warnings.
      </p>
    </div>
  );
};

// Helper function to get the appropriate icon based on warning type
function getWarningIcon(warning: ValidationWarning) {
  switch (warning.type) {
    case 'future_trips':
      return <Clock className="h-4 w-4 mr-2" />;
    case 'source_restriction':
    case 'dest_restriction':
      return <AlertTriangle className="h-4 w-4 mr-2" />;
    default:
      return <AlertCircle className="h-4 w-4 mr-2" />;
  }
}

// Helper function to get an appropriate title based on warning type
function getWarningTitle(warning: ValidationWarning) {
  switch (warning.type) {
    case 'future_trips':
      return 'Dependent Trips Warning';
    case 'source_restriction':
      return 'Source Track Restriction';
    case 'dest_restriction':
      return 'Destination Track Restriction';
    case 'restriction':
      return 'Track Restriction';
    default:
      return 'Warning';
  }
}

export default ValidationWarnings; 