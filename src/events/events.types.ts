export type ImpactType = 'High' | 'Medium' | 'Low' | 'Holiday';

export interface ParsedEvent {
  title: string;
  currency: string;
  impact: ImpactType;
  eventDate: string;   // YYYY-MM-DD
  eventTime: string | null;   // HH:MM (UTC) or null for all-day
  forecast: string | null;
  previous: string | null;
  actual: string | null;
  detailUrl?: string | null;
}

export interface DbEvent {
  id: string;
  event_hash: string;
  title: string;
  currency: string;
  impact: ImpactType;
  event_date: string;  // YYYY-MM-DD
  event_time: string | null; // HH:MM:SS or null
  forecast: string | null;
  previous: string | null;
  actual: string | null;
  detail_url: string | null;
  first_seen_at: string;
  last_updated_at: string;
  scan_batch_id: string | null;
}

export interface ScanSummary {
  newEvents: DbEvent[];
  updatedActuals: DbEvent[];
}

export interface ScanLog {
  id: string;
  batch_id: string;
  started_at: string;
  finished_at: string | null;
  events_found: number;
  events_new: number;
  status: 'running' | 'success' | 'failed';
  error_msg: string | null;
  source: string;
}
