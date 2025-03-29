import { createClient } from '@supabase/supabase-js';

// Types for database tables
export type Project = {
  id: string;
  name: string;
  color: string;
  start_date?: string;
  end_date?: string;
  created_at: string;
  updated_at: string;
};

export type ProjectUserRole = 'admin' | 'editor' | 'viewer';

export type ProjectUser = {
  id: string;
  project_id: string;
  user_id: string;
  role: ProjectUserRole;
  created_at: string;
  updated_at: string;
};

export type Node = {
  id: string;
  name: string;
  type: 'station' | 'site';
  project_id: string;
  station_plan?: string; // URL to the station plan PDF
  created_at: string;
  updated_at: string;
};

export type Track = {
  id: string;
  name: string;
  node_id: string;
  useful_length?: number;
  available_from?: string;
  available_to?: string;
  created_at: string;
  updated_at: string;
};

export type WagonType = {
  id: string;
  name: string;
  default_length: number;
  created_at: string;
  updated_at: string;
};

export type Wagon = {
  id: string;
  external_id?: string;
  type_id: string;
  custom_type?: string;
  number?: string;
  length: number;
  useful_length?: number;
  content?: string;
  project_id: string;
  track_id?: string;
  current_track_id?: string;
  construction_site_id?: string;
  temp_id?: string;
  created_at: string;
  updated_at: string;
};

export type TripType = 'delivery' | 'departure' | 'internal';

export type Trip = {
  id: string;
  type: string;
  datetime: string;
  source_track_id?: string;
  dest_track_id?: string;
  transport_plan_number?: string;
  transport_plan_file?: string; // URL to the transport plan file
  project_id: string;
  is_planned: boolean;
  has_conflicts?: boolean; // Flag for trips with capacity or restriction conflicts
  construction_site_id?: string; // Reference to a construction site node
  comment?: string;
  created_at: string;
  updated_at: string;
};

// Interface for wagon groups in a trip form
export interface WagonGroup {
  id: string; // Local ID for the form
  wagonTypeId: string;
  quantity: number;
  content: string;
  wagons: Wagon[]; // Individual wagons created from this group
}

export type TripWagon = {
  id: string;
  trip_id: string;
  wagon_id: string;
  created_at: string;
};

export type RestrictionType = 'no_entry' | 'no_exit';
export type RepetitionPattern = 'once' | 'daily' | 'weekly' | 'monthly';

export interface Restriction {
  id: string;
  project_id: string;
  type?: string;
  from_datetime?: string;
  to_datetime?: string;
  recurrence: string;
  repetition_pattern?: string;
  restriction_types?: RestrictionType[];
  comment?: string;
  created_at: string;
  updated_at: string;
}

export type RestrictionNode = {
  id: string;
  restriction_id: string;
  node_id: string;
  created_at: string;
};

export interface RestrictionTrack {
  id: string;
  restriction_id: string;
  track_id: string;
  created_at: string;
}

export type UserRole = 'admin' | 'viewer';

export type User = {
  id: string;
  email: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
};

// Database type definition
export type Database = {
  public: {
    Tables: {
      projects: {
        Row: Project;
        Insert: Omit<Project, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Project, 'id' | 'created_at' | 'updated_at'>>;
      };
      project_users: {
        Row: ProjectUser;
        Insert: Omit<ProjectUser, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<ProjectUser, 'id' | 'created_at' | 'updated_at'>>;
      };
      nodes: {
        Row: Node;
        Insert: Omit<Node, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Node, 'id' | 'created_at' | 'updated_at'>>;
      };
      tracks: {
        Row: Track;
        Insert: Omit<Track, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Track, 'id' | 'created_at' | 'updated_at'>>;
      };
      wagon_types: {
        Row: WagonType;
        Insert: Omit<WagonType, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<WagonType, 'id' | 'created_at' | 'updated_at'>>;
      };
      wagons: {
        Row: Wagon;
        Insert: Omit<Wagon, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Wagon, 'id' | 'created_at' | 'updated_at'>>;
      };
      trip_types: {
        Row: { type: TripType; description: string };
        Insert: { type: TripType; description: string };
        Update: Partial<{ type: TripType; description: string }>;
      };
      trips: {
        Row: Trip;
        Insert: Omit<Trip, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Trip, 'id' | 'created_at' | 'updated_at'>>;
      };
      trip_wagons: {
        Row: TripWagon;
        Insert: Omit<TripWagon, 'id' | 'created_at'>;
        Update: Partial<Omit<TripWagon, 'id' | 'created_at'>>;
      };
      restriction_types: {
        Row: { type: RestrictionType; description: string };
        Insert: { type: RestrictionType; description: string };
        Update: Partial<{ type: RestrictionType; description: string }>;
      };
      recurrence_types: {
        Row: { type: RepetitionPattern; description: string };
        Insert: { type: RepetitionPattern; description: string };
        Update: Partial<{ type: RepetitionPattern; description: string }>;
      };
      restrictions: {
        Row: Restriction;
        Insert: Omit<Restriction, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Restriction, 'id' | 'created_at' | 'updated_at'>>;
      };
      restriction_nodes: {
        Row: RestrictionNode;
        Insert: Omit<RestrictionNode, 'id' | 'created_at'>;
        Update: Partial<Omit<RestrictionNode, 'id' | 'created_at'>>;
      };
      restriction_tracks: {
        Row: RestrictionTrack;
        Insert: Omit<RestrictionTrack, 'id' | 'created_at'>;
        Update: Partial<Omit<RestrictionTrack, 'id' | 'created_at'>>;
      };
      users: {
        Row: User;
        Insert: Omit<User, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<User, 'id' | 'created_at' | 'updated_at'>>;
      };
    };
  };
};

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

// Helper function to check if user is authenticated
export const isUserAuthenticated = async () => {
  const { data: { user }, error } = await supabase.auth.getUser();
  return { user, error };
};

// Helper function to get current user role
export const getUserRole = async () => {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { role: null, error: authError };
  }
  
  // Get user role from users table
  const { data, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  
  return { 
    role: data?.role as UserRole | null, 
    error 
  };
};

// Helper function to check if user is admin
export const isAdmin = async () => {
  const { role, error } = await getUserRole();
  return { isAdmin: role === 'admin', error };
};

export interface TrackOccupancy {
  id: string;
  track_id: string;
  occupancy_date: string;
  total_length: number;
  occupied_length: number;
  available_length: number;
  occupancy_percentage: number;
  wagon_count: number;
  created_at: string;
  updated_at: string;
} 