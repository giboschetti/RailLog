'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Database } from '@/types/supabase';
import ContentLayout from '@/components/layout/ContentLayout';
import { validateInternalTrip } from '@/lib/tripValidation';
import { checkTrackCapacityForTrip } from '@/lib/trackUtils';
import { formatDateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ScheduleTestPage() {
  const params = useParams();
  const projectId = params.id as string;
  const supabase = createClientComponentClient<Database>();
  
  const [tracks, setTracks] = useState<any[]>([]);
  const [wagons, setWagons] = useState<any[]>([]);
  const [selectedSourceTrackId, setSelectedSourceTrackId] = useState<string>('');
  const [selectedDestTrackId, setSelectedDestTrackId] = useState<string>('');
  const [selectedWagons, setSelectedWagons] = useState<any[]>([]);
  const [dateTime, setDateTime] = useState<string>('');
  const [validationResult, setValidationResult] = useState<any>(null);
  const [capacityResult, setCapacityResult] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    loadTracks();
  }, [projectId]);

  useEffect(() => {
    if (selectedSourceTrackId) {
      loadWagonsForTrack(selectedSourceTrackId);
    } else {
      setWagons([]);
      setSelectedWagons([]);
    }
  }, [selectedSourceTrackId]);

  const loadTracks = async () => {
    try {
      const { data, error } = await supabase
        .from('tracks')
        .select('*')
        .eq('project_id', projectId)
        .order('name');
      
      if (error) throw error;
      setTracks(data || []);
    } catch (error: any) {
      console.error('Error loading tracks:', error);
    }
  };

  const loadWagonsForTrack = async (trackId: string) => {
    try {
      const { data, error } = await supabase
        .from('wagons')
        .select('*, wagon_types(name, default_length)')
        .eq('current_track_id', trackId);
      
      if (error) throw error;
      setWagons(data || []);
    } catch (error: any) {
      console.error('Error loading wagons:', error);
    }
  };

  const toggleWagonSelection = (wagon: any) => {
    if (selectedWagons.some(w => w.id === wagon.id)) {
      setSelectedWagons(selectedWagons.filter(w => w.id !== wagon.id));
    } else {
      setSelectedWagons([...selectedWagons, wagon]);
    }
  };

  const validateTrip = async () => {
    if (!selectedSourceTrackId || !selectedDestTrackId || !dateTime || selectedWagons.length === 0) {
      alert('Please fill in all required fields');
      return;
    }

    setLoading(true);
    try {
      // 1. Validate the internal trip
      const tripValidation = await validateInternalTrip({
        sourceTrackId: selectedSourceTrackId,
        destTrackId: selectedDestTrackId,
        dateTime,
        selectedWagons
      });
      
      setValidationResult(tripValidation);
      
      // 2. Check track capacity
      const totalWagonLength = selectedWagons.reduce((total, wagon) => total + (wagon.length || 0), 0);
      const capacity = await checkTrackCapacityForTrip(
        selectedDestTrackId,
        dateTime,
        totalWagonLength
      );
      
      setCapacityResult(capacity);
    } catch (error: any) {
      console.error('Error during validation:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const renderValidationDisplay = () => {
    if (!validationResult) return null;
    
    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Trip Validation Result</CardTitle>
          <CardDescription>
            {validationResult.isValid ? 
              '✅ Trip is valid' : 
              '❌ Trip has validation errors'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {validationResult.errors.length > 0 && (
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-red-500">Errors</h3>
              <ul className="list-disc pl-5">
                {validationResult.errors.map((error: any, i: number) => (
                  <li key={i} className="text-red-500">
                    {error.field}: {error.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {validationResult.warnings.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-yellow-500">Warnings</h3>
              <ul className="list-disc pl-5">
                {validationResult.warnings.map((warning: any, i: number) => (
                  <li key={i} className="text-yellow-500">
                    {warning.type}: {warning.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderCapacityDisplay = () => {
    if (!capacityResult) return null;
    
    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Track Capacity Check</CardTitle>
          <CardDescription>
            {capacityResult.hasCapacity ? 
              '✅ Track has enough capacity' : 
              '❌ Track does not have enough capacity'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div>Track Length: {capacityResult.trackLength}m</div>
            <div>Current Usage: {capacityResult.currentUsage}m</div>
            <div>Required Additional: {capacityResult.additionalLength}m</div>
            <div>Available: {capacityResult.availableLength}m</div>
            {capacityResult.timeBasedCheck && (
              <div className="text-green-500 font-semibold">✓ Time-based check was performed</div>
            )}
            {capacityResult.staticCheck && (
              <div className="text-yellow-500 font-semibold">⚠ Static check fallback was used</div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <ContentLayout
      title="Schedule and Capacity Test"
      subtitle="Test the new time-based scheduling and capacity validation system">
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Trip Details</CardTitle>
            <CardDescription>Configure trip parameters to test validation</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="datetime">Trip Date & Time</Label>
              <Input
                id="datetime"
                type="datetime-local"
                value={dateTime}
                onChange={(e) => setDateTime(e.target.value)}
                className="w-full"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="sourceTrack">Source Track</Label>
              <Select
                value={selectedSourceTrackId}
                onValueChange={setSelectedSourceTrackId}
              >
                <SelectTrigger id="sourceTrack" className="w-full">
                  <SelectValue placeholder="Select source track" />
                </SelectTrigger>
                <SelectContent>
                  {tracks.map((track) => (
                    <SelectItem key={track.id} value={track.id}>
                      {track.name} ({track.useful_length || 0}m)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="destTrack">Destination Track</Label>
              <Select
                value={selectedDestTrackId}
                onValueChange={setSelectedDestTrackId}
              >
                <SelectTrigger id="destTrack" className="w-full">
                  <SelectValue placeholder="Select destination track" />
                </SelectTrigger>
                <SelectContent>
                  {tracks.map((track) => (
                    <SelectItem key={track.id} value={track.id}>
                      {track.name} ({track.useful_length || 0}m)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <Button 
              onClick={validateTrip} 
              disabled={loading || !selectedSourceTrackId || !selectedDestTrackId || !dateTime || selectedWagons.length === 0}
              className="w-full mt-4"
            >
              {loading ? 'Validating...' : 'Validate Trip'}
            </Button>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Wagons on Source Track</CardTitle>
            <CardDescription>
              {selectedWagons.length} wagons selected 
              ({selectedWagons.reduce((total, wagon) => total + (wagon.length || 0), 0)}m total)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {wagons.length === 0 ? (
              <div className="text-center text-gray-500 py-4">
                {selectedSourceTrackId 
                  ? 'No wagons available on selected track' 
                  : 'Select a source track to view wagons'}
              </div>
            ) : (
              <div className="space-y-2">
                {wagons.map((wagon) => (
                  <div 
                    key={wagon.id} 
                    className={`p-2 border rounded cursor-pointer ${
                      selectedWagons.some(w => w.id === wagon.id) 
                        ? 'bg-blue-100 border-blue-500' 
                        : 'hover:bg-gray-50'
                    }`}
                    onClick={() => toggleWagonSelection(wagon)}
                  >
                    <div className="font-medium">{wagon.wagon_types?.name || 'Unknown'}</div>
                    <div className="text-sm text-gray-500">
                      Length: {wagon.length || wagon.wagon_types?.default_length || 0}m
                      {wagon.content && ` | Content: ${wagon.content}`}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      {renderValidationDisplay()}
      {renderCapacityDisplay()}
      
      <div className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle>About Time-Based Validation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p>
                The new validation system now allows wagons to be moved multiple times in a single day,
                as long as the moves don't conflict within a 2-hour window around each trip time.
              </p>
              
              <h3 className="font-semibold">How it works:</h3>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>Conflict checking:</strong> The system checks if any wagon in your trip 
                  is already scheduled for another trip within 1 hour before or after your planned time.
                </li>
                <li>
                  <strong>Track capacity:</strong> The validation checks which wagons will actually be 
                  present on the track at the specific time of your trip, considering all planned moves 
                  before that time.
                </li>
                <li>
                  <strong>Multiple moves:</strong> You can now schedule a wagon to move from Track A to 
                  Track B in the morning, and from Track B to Track C in the evening, as long as there's 
                  sufficient time between moves.
                </li>
              </ul>
              
              <p>
                This test page allows you to validate these scenarios before creating actual trips.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
} 