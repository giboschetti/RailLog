import React from 'react';
import { Button } from '@/components/ui/button';
import { ValidationWarning } from '@/lib/tripValidation';

interface ValidationWarningsProps {
  warnings: ValidationWarning[];
  onProceedAnyway: () => void;
  onCancel: () => void;
}

const ValidationWarnings: React.FC<ValidationWarningsProps> = ({
  warnings,
  onProceedAnyway,
  onCancel
}) => {
  // Group warnings by type for better display
  const capacityWarnings = warnings.filter(w => w.code === 'INSUFFICIENT_CAPACITY');
  const restrictionWarnings = warnings.filter(w => w.code === 'ACTIVE_RESTRICTIONS');
  const duplicateWarnings = warnings.filter(w => w.code === 'DUPLICATE_WAGON_NUMBERS');
  const dateWarnings = warnings.filter(w => 
    w.code === 'DATE_BEFORE_PROJECT' || w.code === 'DATE_AFTER_PROJECT'
  );
  const otherWarnings = warnings.filter(w => 
    !['INSUFFICIENT_CAPACITY', 'ACTIVE_RESTRICTIONS', 'DUPLICATE_WAGON_NUMBERS', 
      'DATE_BEFORE_PROJECT', 'DATE_AFTER_PROJECT'].includes(w.code)
  );

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Validierungswarnungen</h3>
      
      {capacityWarnings.length > 0 && (
        <div className="bg-red-50 border border-red-400 text-red-800 rounded-md p-4 my-3">
          <h4 className="text-red-800 font-semibold">Kapazitätsprobleme</h4>
          <div>
            <p className="mb-2">Das Zielgleis hat nicht genügend Kapazität für die angegebenen Waggons:</p>
            <ul className="list-disc pl-5 mb-2 text-sm">
              {capacityWarnings.map((warning, index) => (
                <li key={index}>
                  <div className="font-medium">{warning.message}</div>
                  {warning.details && (
                    <div className="text-xs mt-1">
                      <div>Gleis-Kapazität: {warning.details.trackLength}m</div>
                      <div>Aktuelle Belegung: {warning.details.currentUsage}m</div>
                      <div>Benötigte Länge: {warning.details.requiredLength}m</div>
                      <div>Verfügbar: {warning.details.availableSpace}m</div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      
      {restrictionWarnings.length > 0 && (
        <div className="bg-red-50 border border-red-400 text-red-800 rounded-md p-4 my-3">
          <h4 className="text-red-800 font-semibold">Aktive Einschränkungen</h4>
          <div>
            <p className="mb-2">Es gibt aktive Einschränkungen für die gewählte Zeit und das Gleis:</p>
            <ul className="list-disc pl-5 mb-2 text-sm">
              {restrictionWarnings.map((warning, index) => (
                <li key={index}>
                  <div className="font-medium">{warning.message}</div>
                  {warning.details?.restrictions && (
                    <div className="text-xs mt-1">
                      {warning.details.restrictions.map((r: any, i: number) => (
                        <div key={i} className="mb-1 p-1 border-l-2 border-red-300 pl-2">
                          <div>{r.type === 'no_entry' ? 'Keine Einfahrt' : 'Keine Ausfahrt'}</div>
                          <div>Grund: {r.comment || 'Nicht angegeben'}</div>
                          <div>Von: {r.restriction_date} {r.time_from || '00:00'}</div>
                          <div>Bis: {r.restriction_date} {r.time_to || '23:59'}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      
      {duplicateWarnings.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-400 text-yellow-800 rounded-md p-4 my-3">
          <h4 className="text-yellow-800 font-semibold">Doppelte Waggonnummern</h4>
          <div>
            <p className="mb-2">Einige Waggonnummern existieren bereits im System:</p>
            <ul className="list-disc pl-5 mb-2 text-sm">
              {duplicateWarnings.map((warning, index) => (
                <li key={index}>
                  <div className="font-medium">{warning.message}</div>
                  {warning.details?.duplicateNumbers && (
                    <div className="text-xs mt-1">
                      <div>Doppelte Nummern: {warning.details.duplicateNumbers.join(', ')}</div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      
      {dateWarnings.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-400 text-yellow-800 rounded-md p-4 my-3">
          <h4 className="text-yellow-800 font-semibold">Datumsprobleme</h4>
          <div>
            <ul className="list-disc pl-5 mb-2 text-sm">
              {dateWarnings.map((warning, index) => (
                <li key={index}>
                  <div className="font-medium">{warning.message}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      
      {otherWarnings.length > 0 && (
        <div className="bg-gray-50 border border-gray-300 rounded-md p-4 my-3">
          <h4 className="font-semibold">Weitere Warnungen</h4>
          <div>
            <ul className="list-disc pl-5 mb-2 text-sm">
              {otherWarnings.map((warning, index) => (
                <li key={index}>{warning.message}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      
      <div className="flex justify-end space-x-3 mt-6">
        <Button
          onClick={onCancel}
          variant="outline"
        >
          Abbrechen
        </Button>
        <Button
          onClick={onProceedAnyway}
          variant="destructive"
        >
          Trotzdem fortfahren
        </Button>
      </div>
    </div>
  );
};

export default ValidationWarnings; 