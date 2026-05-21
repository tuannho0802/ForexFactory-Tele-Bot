import { Injectable, Logger } from '@nestjs/common';
import { UsersRepository } from './users.repository';
import { User, UserSettings } from './users.types';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly usersRepository: UsersRepository) {}

  async registerUser(
    telegramId: number,
    username: string | null,
    firstName: string | null,
    language = 'vi',
    timezone = 'Asia/Ho_Chi_Minh'
  ): Promise<User> {
    try {
      this.logger.log(`Registering/updating user with telegramId: ${telegramId}`);
      return await this.usersRepository.upsertUser(telegramId, username, firstName, language, timezone);
    } catch (error: any) {
      this.logger.error(`Failed to register user: ${telegramId}`, error.stack);
      throw error;
    }
  }

  async getUser(telegramId: number): Promise<User | null> {
    try {
      return await this.usersRepository.getUserByTelegramId(telegramId);
    } catch (error: any) {
      this.logger.error(`Failed to get user by telegramId: ${telegramId}`, error.stack);
      throw error;
    }
  }

  async getActiveUsers(): Promise<User[]> {
    try {
      return await this.usersRepository.getActiveUsers();
    } catch (error: any) {
      this.logger.error('Failed to get active users', error.stack);
      throw error;
    }
  }

  async deactivateUser(telegramId: number): Promise<void> {
    try {
      await this.usersRepository.deactivateUser(telegramId);
    } catch (error: any) {
      this.logger.error(`Failed to deactivate user by telegramId: ${telegramId}`, error.stack);
      throw error;
    }
  }

  async getUserSettings(userId: string): Promise<UserSettings | null> {
    try {
      return await this.usersRepository.getSettings(userId);
    } catch (error: any) {
      this.logger.error(`Failed to get settings for user ${userId}`, error.stack);
      throw error;
    }
  }

  async updateUserSettings(userId: string, settings: Partial<UserSettings>): Promise<UserSettings> {
    try {
      this.logger.log(`Updating settings for user: ${userId}`);
      return await this.usersRepository.upsertSettings(userId, settings);
    } catch (error: any) {
      this.logger.error(`Failed to update settings for user ${userId}`, error.stack);
      throw error;
    }
  }
}
