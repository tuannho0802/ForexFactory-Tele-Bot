import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { User, UserSettings } from './users.types';

@Injectable()
export class UsersRepository {
  private readonly logger = new Logger(UsersRepository.name);

  constructor(private readonly supabase: SupabaseService) {}

  async upsertUser(
    telegramId: number,
    username: string | null,
    firstName: string | null,
    language = 'vi',
    timezone = 'Asia/Ho_Chi_Minh'
  ): Promise<User> {
    try {
      const client = this.supabase.getClient();
      const { data, error } = await client
        .from('users')
        .upsert(
          {
            telegram_id: telegramId,
            username,
            first_name: firstName,
            language,
            timezone,
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'telegram_id' }
        )
        .select()
        .single();

      if (error) {
        throw error;
      }

      // Ensure default settings exist for the user
      await this.ensureDefaultSettings(data.id);

      return data as User;
    } catch (error: any) {
      this.logger.error(`Error in upsertUser for telegramId: ${telegramId}`, error.stack);
      throw error;
    }
  }

  async registerUserInactive(telegramId: number, username?: string, firstName?: string): Promise<void> {
    const { error } = await this.supabase.getClient()
      .from('users')
      .upsert(
        {
          telegram_id: telegramId,
          username: username ?? null,
          first_name: firstName ?? null,
          is_active: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'telegram_id', ignoreDuplicates: false }
      );
    if (error) throw error;
  }

  async activateUser(userId: string): Promise<void> {
    const { error } = await this.supabase.getClient()
      .from('users')
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq('id', userId);
    if (error) throw error;
  }

  async getUserByTelegramId(telegramId: number): Promise<User | null> {
    try {
      const client = this.supabase.getClient();
      const { data, error } = await client
        .from('users')
        .select('*')
        .eq('telegram_id', telegramId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data as User | null;
    } catch (error: any) {
      this.logger.error(`Error in getUserByTelegramId for telegramId: ${telegramId}`, error.stack);
      throw error;
    }
  }

  async getActiveUsers(): Promise<User[]> {
    try {
      const client = this.supabase.getClient();
      const { data, error } = await client
        .from('users')
        .select('*')
        .eq('is_active', true)
        .eq('is_banned', false);

      if (error) {
        throw error;
      }

      return data as User[];
    } catch (error: any) {
      this.logger.error('Error in getActiveUsers', error.stack);
      throw error;
    }
  }

  async deactivateUser(telegramId: number): Promise<void> {
    try {
      const client = this.supabase.getClient();
      const { error } = await client
        .from('users')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('telegram_id', telegramId);

      if (error) {
        throw error;
      }
      this.logger.log(`Deactivated user with telegramId: ${telegramId}`);
    } catch (error: any) {
      this.logger.error(`Error in deactivateUser for telegramId: ${telegramId}`, error.stack);
      throw error;
    }
  }

  async upsertSettings(userId: string, settings: Partial<UserSettings>): Promise<UserSettings> {
    try {
      const client = this.supabase.getClient();
      
      // Get current settings or start with empty
      const existing = await this.getSettings(userId);
      
      const payload = {
        user_id: userId,
        morning_enabled: settings.morning_enabled !== undefined ? settings.morning_enabled : (existing?.morning_enabled ?? true),
        morning_time: settings.morning_time || (existing?.morning_time ?? '08:00:00'),
        alert_enabled: settings.alert_enabled !== undefined ? settings.alert_enabled : (existing?.alert_enabled ?? true),
        alert_minutes: settings.alert_minutes !== undefined ? settings.alert_minutes : (existing?.alert_minutes ?? 15),
        impact_filter: settings.impact_filter || (existing?.impact_filter ?? ['High']),
        currency_filter: settings.currency_filter !== undefined ? settings.currency_filter : (existing?.currency_filter ?? null),
      };

      const { data, error } = await client
        .from('user_settings')
        .upsert(payload, { onConflict: 'user_id' })
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data as UserSettings;
    } catch (error: any) {
      this.logger.error(`Error in upsertSettings for userId: ${userId}`, error.stack);
      throw error;
    }
  }

  async getSettings(userId: string): Promise<UserSettings | null> {
    try {
      const client = this.supabase.getClient();
      const { data, error } = await client
        .from('user_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data as UserSettings | null;
    } catch (error: any) {
      this.logger.error(`Error in getSettings for userId: ${userId}`, error.stack);
      throw error;
    }
  }

  private async ensureDefaultSettings(userId: string): Promise<void> {
    try {
      const client = this.supabase.getClient();
      const { count, error: countError } = await client
        .from('user_settings')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (countError) throw countError;

      if (count === 0) {
        const { error: insertError } = await client
          .from('user_settings')
          .insert({
            user_id: userId,
            morning_enabled: true,
            morning_time: '08:00:00',
            alert_enabled: true,
            alert_minutes: 15,
            impact_filter: ['High'],
            currency_filter: null,
          });

        if (insertError) throw insertError;
      }
    } catch (error: any) {
      this.logger.error(`Error ensuring default settings for userId: ${userId}`, error.stack);
      // Don't rethrow, setting default failure shouldn't crash the startup
    }
  }
}
