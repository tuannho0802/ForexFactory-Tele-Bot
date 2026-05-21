import { Update, Start, Help, Command, Ctx } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { Logger, UseGuards } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { EventsService } from '../events/events.service';
import {
  escapeMarkdownV2,
  formatSettings,
  formatEventList,
  formatMorningBriefing,
} from './message-formatter';
import { toZonedTime } from 'date-fns-tz';
import { format } from 'date-fns';

@Update()
export class TelegramUpdate {
  private readonly logger = new Logger(TelegramUpdate.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly eventsService: EventsService
  ) {}

  @Start()
  async onStart(@Ctx() ctx: Context) {
    try {
      const telegramId = ctx.from?.id;
      if (!telegramId) return;

      const username = ctx.from?.username || null;
      const firstName = ctx.from?.first_name || null;

      const user = await this.usersService.registerUser(telegramId, username, firstName);

      const welcomeMessage = [
        `👋 *Xin chào ${escapeMarkdownV2(firstName || 'Nhà giao dịch')}*`,
        ``,
        `Chào mừng bạn đến với *Forex News Telegram Bot*\\!`,
        `Tôi sẽ theo dõi lịch kinh tế của *ForexFactory* và tự động gửi thông báo tin tức quan trọng đến bạn\\.`,
        ``,
        `🎯 *Các lệnh bạn có thể sử dụng:*`,
        `• /help \\- Hướng dẫn sử dụng chi tiết`,
        `• /settings \\- Xem cài đặt hiện tại`,
        `• /subscribe \\- Bật tất cả thông báo`,
        `• /unsubscribe \\- Tắt tất cả thông báo`,
        `• /today \\- Xem tin tức kinh tế hôm nay`,
        `• /next \\- Xem sự kiện sắp diễn ra trong 2 giờ tới`,
      ].join('\n');

      await ctx.replyWithMarkdownV2(welcomeMessage);
    } catch (error: any) {
      this.logger.error('Error in /start command handler', error.stack);
      await ctx.reply('Đã xảy ra lỗi khi khởi tạo dịch vụ. Vui lòng thử lại sau.');
    }
  }

  @Help()
  async onHelp(@Ctx() ctx: Context) {
    const helpMessage = [
      `📖 *HƯỚNG DẪN SỬ DỤNG BOT*`,
      ``,
      `*1\\. Đăng ký và Trạng thái:*`,
      `• /subscribe \\- Bật nhận thông báo tin tức và bản tin`,
      `• /unsubscribe \\- Tạm dừng nhận toàn bộ thông báo`,
      `• /settings \\- Xem chi tiết cài đặt lọc tin hiện tại`,
      ``,
      `*2\\. Cấu hình Bộ lọc:*`,
      `• \`/settime HH:MM\` \\- Đặt giờ nhận bản tin sáng \\(Ví dụ: \`/settime 08:00\`\\)`,
      `• \`/setalert N\` \\- Cảnh báo trước tin diễn ra N phút \\(Ví dụ: \`/setalert 15\`\\)`,
      `• \`/setimpact [High] [Medium] [Low] [Holiday]\` \\- Chọn mức độ tác động muốn lọc \\(Ví dụ: \`/setimpact High Medium\`\\)`,
      `• \`/setcurrency [USD] [EUR] [GBP]\\.\\.\\.\` \\- Lọc theo cặp tiền tệ, bỏ trống để nhận tất cả \\(Ví dụ: \`/setcurrency USD EUR\`\\)`,
      ``,
      `*3\\. Xem thông tin nhanh:*`,
      `• /today \\- Xem toàn bộ tin tức kinh tế diễn ra hôm nay`,
      `• /next \\- Xem các sự kiện sắp diễn ra trong 2 giờ tới`,
    ].join('\n');

    await ctx.replyWithMarkdownV2(helpMessage);
  }

  @Command('subscribe')
  async onSubscribe(@Ctx() ctx: Context) {
    try {
      const telegramId = ctx.from?.id;
      if (!telegramId) return;

      const user = await this.usersService.getUser(telegramId);
      if (!user) {
        return ctx.reply('Vui lòng gõ lệnh /start trước để đăng ký.');
      }

      await this.usersService.updateUserSettings(user.id, {
        morning_enabled: true,
        alert_enabled: true,
      });

      await ctx.reply('✅ Đã bật tất cả thông báo thành công! Bạn sẽ nhận được bản tin sáng và thông báo cảnh báo trước sự kiện kinh tế.');
    } catch (error: any) {
      this.logger.error('Error in /subscribe handler', error.stack);
      await ctx.reply('Đã xảy ra lỗi khi đăng ký. Vui lòng thử lại sau.');
    }
  }

  @Command('unsubscribe')
  async onUnsubscribe(@Ctx() ctx: Context) {
    try {
      const telegramId = ctx.from?.id;
      if (!telegramId) return;

      const user = await this.usersService.getUser(telegramId);
      if (!user) {
        return ctx.reply('Vui lòng gõ lệnh /start trước để đăng ký.');
      }

      await this.usersService.updateUserSettings(user.id, {
        morning_enabled: false,
        alert_enabled: false,
      });

      await ctx.reply('❌ Đã tắt nhận tất cả thông báo thành công! Bạn có thể gõ lệnh /subscribe bất kỳ lúc nào để bật lại.');
    } catch (error: any) {
      this.logger.error('Error in /unsubscribe handler', error.stack);
      await ctx.reply('Đã xảy ra lỗi khi hủy đăng ký. Vui lòng thử lại sau.');
    }
  }

  @Command('settings')
  async onSettings(@Ctx() ctx: Context) {
    try {
      const telegramId = ctx.from?.id;
      if (!telegramId) return;

      const user = await this.usersService.getUser(telegramId);
      if (!user) {
        return ctx.reply('Vui lòng gõ lệnh /start trước để đăng ký.');
      }

      const settings = await this.usersService.getUserSettings(user.id);
      if (!settings) {
        return ctx.reply('Không tìm thấy cấu hình cài đặt của bạn.');
      }

      await ctx.replyWithMarkdownV2(formatSettings(settings));
    } catch (error: any) {
      this.logger.error('Error in /settings handler', error.stack);
      await ctx.reply('Đã xảy ra lỗi khi lấy cài đặt. Vui lòng thử lại sau.');
    }
  }

  @Command('settime')
  async onSetTime(@Ctx() ctx: Context) {
    try {
      const telegramId = ctx.from?.id;
      if (!telegramId) return;

      const user = await this.usersService.getUser(telegramId);
      if (!user) return ctx.reply('Vui lòng gõ lệnh /start trước để đăng ký.');

      const text = (ctx.message as any).text || '';
      const args = text.split(/\s+/).slice(1);
      const timeStr = args[0];

      if (!timeStr || !/^([01]\d|2[0-3]):[0-5]\d$/.test(timeStr)) {
        return ctx.reply('Vui lòng nhập đúng định dạng HH:MM. Ví dụ: /settime 08:30');
      }

      // Store in users local time format
      await this.usersService.updateUserSettings(user.id, {
        morning_time: `${timeStr}:00`,
      });

      await ctx.reply(`✅ Đã đặt giờ nhận bản tin sáng thành công! Giờ nhận mới: ${timeStr}`);
    } catch (error: any) {
      this.logger.error('Error in /settime handler', error.stack);
      await ctx.reply('Đã xảy ra lỗi khi đổi cấu hình thời gian.');
    }
  }

  @Command('setalert')
  async onSetAlert(@Ctx() ctx: Context) {
    try {
      const telegramId = ctx.from?.id;
      if (!telegramId) return;

      const user = await this.usersService.getUser(telegramId);
      if (!user) return ctx.reply('Vui lòng gõ lệnh /start trước để đăng ký.');

      const text = (ctx.message as any).text || '';
      const args = text.split(/\s+/).slice(1);
      const minutesStr = args[0];
      const minutes = parseInt(minutesStr, 10);

      if (isNaN(minutes) || minutes < 1 || minutes > 120) {
        return ctx.reply('Thời gian cảnh báo trước phải từ 1 đến 120 phút. Ví dụ: /setalert 15');
      }

      await this.usersService.updateUserSettings(user.id, {
        alert_minutes: minutes,
      });

      await ctx.reply(`✅ Đã cập nhật cấu hình thời gian báo trước thành công! Nhận cảnh báo trước ${minutes} phút.`);
    } catch (error: any) {
      this.logger.error('Error in /setalert handler', error.stack);
      await ctx.reply('Đã xảy ra lỗi khi cấu hình thời gian báo trước.');
    }
  }

  @Command('setimpact')
  async onSetImpact(@Ctx() ctx: Context) {
    try {
      const telegramId = ctx.from?.id;
      if (!telegramId) return;

      const user = await this.usersService.getUser(telegramId);
      if (!user) return ctx.reply('Vui lòng gõ lệnh /start trước để đăng ký.');

      const text = (ctx.message as any).text || '';
      const args = text.split(/\s+/).slice(1);
      
      if (args.length === 0) {
        return ctx.reply('Vui lòng cung cấp ít nhất một mức độ tác động. Ví dụ: /setimpact High Medium');
      }

      const valid = ['High', 'Medium', 'Low', 'Holiday'];
      const normalized = args
        .map((a: string) => a.charAt(0).toUpperCase() + a.slice(1).toLowerCase())
        .filter((a: string) => valid.includes(a));

      if (normalized.length === 0) {
        return ctx.reply('Mức độ tác động không hợp lệ. Vui lòng nhập: High, Medium, Low, Holiday');
      }

      await this.usersService.updateUserSettings(user.id, {
        impact_filter: normalized,
      });

      await ctx.reply(`✅ Đã cập nhật lọc tác động thành công! Danh sách lọc: ${normalized.join(', ')}`);
    } catch (error: any) {
      this.logger.error('Error in /setimpact handler', error.stack);
      await ctx.reply('Đã xảy ra lỗi khi cấu hình mức độ tác động.');
    }
  }

  @Command('setcurrency')
  async onSetCurrency(@Ctx() ctx: Context) {
    try {
      const telegramId = ctx.from?.id;
      if (!telegramId) return;

      const user = await this.usersService.getUser(telegramId);
      if (!user) return ctx.reply('Vui lòng gõ lệnh /start trước để đăng ký.');

      const text = (ctx.message as any).text || '';
      const args = text.split(/\s+/).slice(1);

      let currencyFilter: string[] | null = null;
      if (args.length > 0 && args[0] !== '') {
        currencyFilter = args.map((c: string) => c.toUpperCase());
      }

      await this.usersService.updateUserSettings(user.id, {
        currency_filter: currencyFilter,
      });

      const filterText = currencyFilter ? currencyFilter.join(', ') : 'Tất cả';
      await ctx.reply(`✅ Đã cập nhật bộ lọc tiền tệ thành công! Các đồng tiền nhận: ${filterText}`);
    } catch (error: any) {
      this.logger.error('Error in /setcurrency handler', error.stack);
      await ctx.reply('Đã xảy ra lỗi khi thiết lập lọc tiền tệ.');
    }
  }

  @Command('today')
  async onToday(@Ctx() ctx: Context) {
    try {
      const telegramId = ctx.from?.id;
      if (!telegramId) return;

      const user = await this.usersService.getUser(telegramId);
      if (!user) return ctx.reply('Vui lòng gõ lệnh /start trước để đăng ký.');

      const userTimezone = user.timezone || 'Asia/Ho_Chi_Minh';
      const zonedDate = toZonedTime(new Date(), userTimezone);
      const userDateStr = format(zonedDate, 'yyyy-MM-dd');

      const events = await this.eventsService.getEventsByDate(userDateStr);

      if (events.length === 0) {
        return ctx.replyWithMarkdownV2(`📅 *Lịch kinh tế hôm nay \\(${escapeMarkdownV2(userDateStr)}\\):*\n\n_Không có tin tức kinh tế quan trọng nào diễn ra hôm nay\\._`);
      }

      // Apply settings filter if available
      const settings = await this.usersService.getUserSettings(user.id);
      let filteredEvents = events;
      if (settings) {
        filteredEvents = events.filter((e) => {
          const matchesImpact = settings.impact_filter.includes(e.impact);
          const matchesCurrency = !settings.currency_filter || settings.currency_filter.length === 0 || settings.currency_filter.includes(e.currency);
          return matchesImpact && matchesCurrency;
        });
      }

      if (filteredEvents.length === 0) {
        return ctx.replyWithMarkdownV2(`📅 *Lịch kinh tế hôm nay \\(${escapeMarkdownV2(userDateStr)}\\):*\n\n_Không có tin tức nào phù hợp với bộ lọc cài đặt của bạn\\._`);
      }

      // Paginate if events count is greater than 10
      const chunkSize = 10;
      for (let i = 0; i < filteredEvents.length; i += chunkSize) {
        const chunk = filteredEvents.slice(i, i + chunkSize);
        const formatted = formatEventList(chunk, userTimezone);
        const pageHeader = filteredEvents.length > chunkSize 
          ? `📅 *LỊCH KINH TẾ HÔM NAY \\(Phần ${Math.floor(i / chunkSize) + 1}\\)*\n\n`
          : `📅 *LỊCH KINH TẾ HÔM NAY \\(${escapeMarkdownV2(userDateStr)}\\)*\n\n`;
        await ctx.replyWithMarkdownV2(pageHeader + formatted);
      }
    } catch (error: any) {
      this.logger.error('Error in /today handler', error.stack);
      await ctx.reply('Đã xảy ra lỗi khi lấy lịch kinh tế hôm nay.');
    }
  }

  @Command('next')
  async onNext(@Ctx() ctx: Context) {
    try {
      const telegramId = ctx.from?.id;
      if (!telegramId) return;

      const user = await this.usersService.getUser(telegramId);
      if (!user) return ctx.reply('Vui lòng gõ lệnh /start trước để đăng ký.');

      const userTimezone = user.timezone || 'Asia/Ho_Chi_Minh';
      const nowUtc = new Date();
      const twoHoursLater = new Date(nowUtc.getTime() + 2 * 60 * 60 * 1000);

      const events = await this.eventsService.getUpcomingEvents(nowUtc, twoHoursLater);

      // Filter events by settings
      const settings = await this.usersService.getUserSettings(user.id);
      let filteredEvents = events;
      if (settings) {
        filteredEvents = events.filter((e) => {
          const matchesImpact = settings.impact_filter.includes(e.impact);
          const matchesCurrency = !settings.currency_filter || settings.currency_filter.length === 0 || settings.currency_filter.includes(e.currency);
          return matchesImpact && matchesCurrency;
        });
      }

      if (filteredEvents.length === 0) {
        return ctx.replyWithMarkdownV2(`🔔 *SỰ KIỆN SẮP DIỄN RA TRONG 2 GIỜ TỚI*\n\n_Không có sự kiện kinh tế quan trọng nào sắp diễn ra phù hợp với cấu hình lọc của bạn\\._`);
      }

      const formatted = formatEventList(filteredEvents, userTimezone);
      await ctx.replyWithMarkdownV2(`🔔 *SỰ KIỆN SẮP DIỄN RA TRONG 2 GIỜ TỚI*\n\n` + formatted);
    } catch (error: any) {
      this.logger.error('Error in /next handler', error.stack);
      await ctx.reply('Đã xảy ra lỗi khi kiểm tra sự kiện tiếp theo.');
    }
  }
}
