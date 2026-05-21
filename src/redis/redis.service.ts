import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from '@upstash/redis';

@Injectable()
export class RedisService implements OnModuleInit {
  private readonly logger = new Logger(RedisService.name);
  private client!: Redis;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    try {
      const url = this.configService.get<string>('UPSTASH_REDIS_REST_URL');
      const token = this.configService.get<string>('UPSTASH_REDIS_REST_TOKEN');

      if (!url || !token) {
        this.logger.warn('UPSTASH_REDIS_REST_URL or REST_TOKEN is missing. Redis operates in degraded mode.');
        return;
      }

      this.client = new Redis({
        url,
        token,
      });
      this.logger.log('Upstash Redis client successfully initialized');
    } catch (error: any) {
      this.logger.error('Failed to initialize Redis client', error.stack);
    }
  }

  async get<T = any>(key: string): Promise<T | null> {
    if (!this.client) return null;
    try {
      return await this.client.get<T>(key);
    } catch (error: any) {
      this.logger.error(`Redis GET error for key: ${key}`, error.stack);
      return null;
    }
  }

  async set(key: string, value: any, ttlSeconds?: number, nx = false): Promise<boolean> {
    if (!this.client) return false;
    try {
      const options: any = {};
      if (ttlSeconds) options.ex = ttlSeconds;
      if (nx) options.nx = true;

      const result = await this.client.set(key, value, options);
      return result === 'OK' || result === true;
    } catch (error: any) {
      this.logger.error(`Redis SET error for key: ${key}`, error.stack);
      return false;
    }
  }

  async setex(key: string, seconds: number, value: any): Promise<boolean> {
    return this.set(key, value, seconds);
  }

  async del(key: string): Promise<boolean> {
    if (!this.client) return false;
    try {
      const result = await this.client.del(key);
      return result > 0;
    } catch (error: any) {
      this.logger.error(`Redis DEL error for key: ${key}`, error.stack);
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    if (!this.client) return false;
    try {
      const result = await this.client.exists(key);
      return result > 0;
    } catch (error: any) {
      this.logger.error(`Redis EXISTS error for key: ${key}`, error.stack);
      return false;
    }
  }

  async withLock<T>(lockKey: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T | null> {
    if (!this.client) {
      this.logger.warn(`Redis lock ${lockKey} bypassed: Redis client not initialized.`);
      return fn();
    }
    const lockValue = `${Date.now()}-${Math.random()}`;
    try {
      const acquired = await this.set(lockKey, lockValue, ttlSeconds, true);
      if (!acquired) {
        this.logger.warn(`Lock ${lockKey} already held — skipping execution.`);
        return null;
      }
      try {
        return await fn();
      } finally {
        const current = await this.get(lockKey);
        if (current === lockValue) {
          await this.del(lockKey);
        }
      }
    } catch (error: any) {
      this.logger.error(`Redis distributed lock error for key: ${lockKey}`, error.stack);
      // Degraded mode: run the function anyway to prevent blocking critical operations
      return fn();
    }
  }
}
