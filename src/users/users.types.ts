export interface User {
  id: string;
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  language: string;
  timezone: string;
  is_active: boolean;
  is_banned: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserSettings {
  id: string;
  user_id: string;
  morning_enabled: boolean;
  morning_time: string;
  alert_enabled: boolean;
  alert_minutes: number;
  impact_filter: string[];
  currency_filter: string[] | null;
}
