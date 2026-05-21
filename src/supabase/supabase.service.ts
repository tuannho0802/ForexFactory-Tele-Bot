import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService implements OnModuleInit {
  private readonly logger = new Logger(SupabaseService.name);
  private client!: SupabaseClient;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    try {
      const url = this.configService.get<string>('SUPABASE_URL');
      const key = this.configService.get<string>('SUPABASE_SERVICE_KEY');

      if (!url || !key) {
        throw new Error('SUPABASE_URL or SUPABASE_SERVICE_KEY is missing in env');
      }

      this.client = createClient(url, key, {
        auth: {
          persistSession: false,
        },
      });
      this.logger.log('Supabase client successfully initialized');
    } catch (error: any) {
      this.logger.error('Failed to initialize Supabase client', error.stack);
      throw error;
    }
  }

  getClient(): SupabaseClient {
    return this.client;
  }
}
