import { Update, Start, Help, Command, Ctx } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { Logger } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { EventsService } from '../events/events.service';
import {
  escapeMarkdownV2,
  formatSettings,
  formatEventList,
} from './message-formatter';
import { getTodayUTC } from '../common/utils/time.util';
import { ForexFactoryService } from '../scraper/forex-factory.service';

@Update()
export class TelegramUpdate {
  private readonly logger = new Logger(TelegramUpdate.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly eventsService: EventsService,
    private readonly forexFactoryService: ForexFactoryService
  ) {}

  @Start()
  async onStart(@Ctx() ctx: Context) {
    try {
      const from = ctx.from;
      if (!from) return;

      // Chỉ upsert user, KHÔNG set is_active = true
      await this.usersService.registerUserInactive(from.id, from.username, from.first_name);

      await ctx.reply(
        `👋 Xin chào ${from.first_name ?? 'bạn'}!\n\n` +
        `🤖 Đây là Forex News Bot — theo dõi lịch kinh tế ForexFactory và gửi thông báo đến bạn.\n\n` +
        `📌 Để bắt đầu nhận thông báo, dùng lệnh:\n` +
        `/subscribe — Bật nhận thông báo\n\n` +
        `📖 Xem hướng dẫn đầy đủ: /help`
      );
    } catch (error: any) {
      this.logger.error('Error in /start command handler', error.stack);
      await ctx.reply('Đã xảy ra lỗi khi khởi tạo dịch vụ. Vui lòng thử lại sau.');
    }
  }

  @Help()
  @Command('help')
  async onHelp(@Ctx() ctx: Context) {
    const helpText =
      '📖 HƯỚNG DẪN SỬ DỤNG FOREX NEWS BOT\n' +
      '━━━━━━━━━━━━━━━━━━━━━━\n\n' +
      
      '👤 BẮT ĐẦU\n' +
      '/start — Đăng ký tài khoản\n' +
      '/subscribe — Bật nhận thông báo tin tức\n' +
      '/unsubscribe — Tắt tất cả thông báo\n\n' +
      
      '⚙️ CẤU HÌNH BỘ LỌC\n' +
      '/setimpact [mức độ] — Chọn mức độ tác động muốn nhận\n' +
      '   Ví dụ: /setimpact High Medium\n' +
      '   Lựa chọn: High | Medium | Low | Holiday\n\n' +
      '/setcurrency [đồng tiền] — Lọc theo đồng tiền\n' +
      '   Ví dụ: /setcurrency USD EUR GBP\n' +
      '   Bỏ trống = nhận tất cả: /setcurrency all\n' +
      '   Hỗ trợ: USD EUR GBP JPY AUD NZD CAD CHF CNY\n\n' +
      
      '🔔 CẤU HÌNH THÔNG BÁO\n' +
      '/settime HH:MM — Đặt giờ nhận bản tin sáng\n' +
      '   Ví dụ: /settime 07:30\n\n' +
      '/setalert N — Đặt cảnh báo trước sự kiện N phút\n' +
      '   Ví dụ: /setalert 10  (từ 1 đến 120 phút)\n\n' +
      
      '📅 XEM LỊCH\n' +
      '/today — Xem tất cả sự kiện hôm nay (theo bộ lọc của bạn)\n' +
      '/next — Xem sự kiện trong 2 giờ tới\n\n' +
      
      '🔧 QUẢN LÝ\n' +
      '/settings — Xem toàn bộ cài đặt hiện tại\n' +
      '/help — Hiển thị hướng dẫn này\n\n' +
      
      '━━━━━━━━━━━━━━━━━━━━━━\n' +
      '💡 Mẹo: Sau /subscribe, dùng /setimpact High để chỉ nhận tin quan trọng nhất.';
    
    await ctx.reply(helpText);
  }

  @Command('subscribe')
  async onSubscribe(@Ctx() ctx: Context) {
    try {
      const telegramId = ctx.from?.id;
      if (!telegramId) return;

      const user = await this.usersService.getUser(telegramId);
      if (!user) {
        return ctx.reply('Vui lòng dùng /start trước để đăng ký.');
      }

      await this.usersService.activateUser(user.id);
      await this.usersService.updateUserSettings(user.id, {
        morning_enabled: true,
        alert_enabled: true,
        impact_filter: ['High', 'Medium'],
        currency_filter: [],
        alert_minutes: 15,
        morning_time: '08:00:00',
      });

      await ctx.reply(
        '✅ Đã bật thông báo!\n\n' +
        '⚙️ Cài đặt mặc định:\n' +
        '  • Bộ lọc: High, Medium\n' +
        '  • Tiền tệ: Tất cả\n' +
        '  • Bản tin sáng: 08:00\n' +
        '  • Cảnh báo trước: 15 phút\n\n' +
        'Dùng /settings để xem chi tiết\n' +
        'Dùng /setimpact, /setcurrency để tùy chỉnh'
      );
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

      await ctx.reply(formatSettings(settings, user));
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
      const text = (ctx.message as any)?.text ?? '';
      const args = text.split(' ').slice(1);
      
      const validImpacts = ['High', 'Medium', 'Low', 'Holiday'];
      const selected = args
        .map((a: string) => a.charAt(0).toUpperCase() + a.slice(1).toLowerCase())
        .filter((a: string) => validImpacts.includes(a));
      
      if (selected.length === 0) {
        await ctx.reply(
          '❌ Cú pháp sai.\n\n' +
          'Dùng: /setimpact High Medium Low Holiday\n' +
          'Ví dụ: /setimpact High Medium\n\n' +
          'Các mức độ hợp lệ: High, Medium, Low, Holiday'
        );
        return;
      }
      
      const user = await this.usersService.getUser(ctx.from!.id);
      if (!user) { await ctx.reply('Vui lòng dùng /start trước.'); return; }
      
      await this.usersService.updateUserSettings(user.id, { impact_filter: selected });
      await ctx.reply(
        `✅ Đã cập nhật bộ lọc tác động:\n` +
        selected.map((i: string) => `  • ${i}`).join('\n')
      );
    } catch (error: any) {
      this.logger.error('Error in /setimpact handler', error.stack);
      await ctx.reply('Đã xảy ra lỗi khi cấu hình mức độ tác động.');
    }
  }

  @Command('setcurrency')
  async onSetCurrency(@Ctx() ctx: Context) {
    try {
      const text = (ctx.message as any)?.text ?? '';
      const args = text.split(' ').slice(1);
      
      if (args.length === 0 || args[0].toLowerCase() === 'all') {
        const user = await this.usersService.getUser(ctx.from!.id);
        if (!user) { await ctx.reply('Vui lòng dùng /start trước.'); return; }
        await this.usersService.updateUserSettings(user.id, { currency_filter: [] });
        await ctx.reply('✅ Đã bỏ lọc tiền tệ — sẽ nhận tất cả các đồng tiền.');
        return;
      }
      
      const currencies = args.map((a: string) => a.toUpperCase());
      const validCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF', 'CNY', 'ALL'];
      const invalid = currencies.filter((c: string) => !validCurrencies.includes(c) && c !== 'ALL');
      
      if (invalid.length > 0) {
        await ctx.reply(
          `❌ Đồng tiền không hợp lệ: ${invalid.join(', ')}\n\n` +
          `Hợp lệ: USD EUR GBP JPY AUD NZD CAD CHF CNY\n` +
          `Hoặc dùng /setcurrency all để nhận tất cả`
        );
        return;
      }
      
      const user = await this.usersService.getUser(ctx.from!.id);
      if (!user) { await ctx.reply('Vui lòng dùng /start trước.'); return; }
      
      await this.usersService.updateUserSettings(user.id, { currency_filter: currencies });
      await ctx.reply(
        `✅ Đã cập nhật bộ lọc tiền tệ:\n` +
        currencies.map((c: string) => `  • ${c}`).join('\n')
      );
    } catch (error: any) {
      this.logger.error('Error in /setcurrency handler', error.stack);
      await ctx.reply('Đã xảy ra lỗi khi thiết lập lọc tiền tệ.');
    }
  }

  @Command('today')
  async onToday(@Ctx() ctx: Context) {
    const todayUtc = getTodayUTC();
    this.logger.debug({ todayUtc }, '📅 /today command - UTC date');

    const now = new Date();
    this.logger.debug({
      nowISO: now.toISOString(),
      nowLocal: now.toString(),
      todayUtc,
    }, '🕐 Current time check');

    try {
      const telegramId = ctx.from?.id;
      if (!telegramId) return;

      const user = await this.usersService.getUser(telegramId);
      if (!user) return ctx.reply('Vui lòng gõ lệnh /start trước để đăng ký.');

      const settings = await this.usersService.getUserSettings(user.id);
      
      this.logger.debug({
        userId: user?.id,
        isActive: user?.is_active,
        impactFilter: settings?.impact_filter,
        currencyFilter: settings?.currency_filter,
      }, '👤 User settings for /today');

      const allEvents = await this.eventsService.getEventsByDate(todayUtc);

      this.logger.debug({
        total: allEvents.length,
        events: allEvents.slice(0, 10).map(e => ({
          title: e.title,
          impact: e.impact,
          currency: e.currency,
          event_date: e.event_date,
        })),
      }, '📋 ALL EVENTS FOR TODAY (before filtering)');

      let filtered = allEvents;
      if (settings?.impact_filter && settings.impact_filter.length > 0) {
        this.logger.debug({ filter: settings.impact_filter }, '🔍 Applying impact filter');
        filtered = allEvents.filter(e => settings.impact_filter!.includes(e.impact));
        
        this.logger.debug({
          before: allEvents.length,
          after: filtered.length,
          filter: settings.impact_filter,
        }, '📊 After impact filter');
      }

      if (settings?.currency_filter && settings.currency_filter.length > 0) {
        this.logger.debug({ filter: settings.currency_filter }, '🔍 Applying currency filter');
        filtered = filtered.filter(e => settings.currency_filter!.includes(e.currency));
        
        this.logger.debug({
          before: allEvents.length,
          after: filtered.length,
          filter: settings.currency_filter,
        }, '📊 After currency filter');
      }

      this.logger.debug({ finalCount: filtered.length }, '🎯 Final filtered events for /today');

      if (filtered.length === 0) {
        this.logger.warn({
          todayUtc,
          totalEventsInDb: allEvents.length,
          impactFilter: settings?.impact_filter,
          currencyFilter: settings?.currency_filter,
          sampleImpacts: allEvents.slice(0, 10).map(e => e.impact),
          sampleCurrencies: allEvents.slice(0, 10).map(e => e.currency),
        }, '⚠️ No events after filtering!');

        await ctx.reply(
          `📅 Lịch kinh tế ${todayUtc}\n\n` +
          `Không có sự kiện nào khớp với bộ lọc của bạn.\n` +
          `Dùng /setimpact hoặc /setcurrency để thay đổi bộ lọc.`
        );
        return;
      }

      const userTimezone = user?.timezone || 'Asia/Ho_Chi_Minh';
      const chunkSize = 10;
      for (let i = 0; i < filtered.length; i += chunkSize) {
        const chunk = filtered.slice(i, i + chunkSize);
        const formatted = formatEventList(chunk, userTimezone);
        const pageHeader = filtered.length > chunkSize 
          ? `📅 *LỊCH KINH TẾ HÔM NAY \\(Phần ${Math.floor(i / chunkSize) + 1}\\)*\n\n`
          : `📅 *LỊCH KINH TẾ HÔM NAY \\(${escapeMarkdownV2(todayUtc)}\\)*\n\n`;
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

  @Command('debug')
  async onDebug(@Ctx() ctx: Context) {
    const adminIds = (process.env.ADMIN_CHAT_IDS || '').split(',').map(Number);
    if (!adminIds.includes(ctx.from!.id)) {
      await ctx.reply('⛔ Bạn không có quyền sử dụng lệnh này.');
      return;
    }
    
    await ctx.reply('🔍 Đang kiểm tra dữ liệu từ ForexFactory...');
    
    try {
      // Test cả 3 nguồn dữ liệu
      const results = await this.forexFactoryService.debugFetchAllSources();
      
      let debugMessage = '📊 *KẾT QUẢ DEBUG*\n\n';
      
      for (const [source, data] of Object.entries(results)) {
        debugMessage += `*${source.toUpperCase()}:*\n`;
        debugMessage += `  • Số events: ${data.count ?? 'Error'}\n`;
        debugMessage += `  • Events hôm nay: ${data.todayCount ?? 'N/A'}\n`;
        debugMessage += `  • Sample: ${data.sample || 'N/A'}\n`;
        if (data.error) debugMessage += `  • Error: ${data.error}\n`;
        debugMessage += '\n';
      }
      
      // Kiểm tra kết nối API
      const today = getTodayUTC();
      const dbCount = await this.eventsService.countEventsByDate(today);
      debugMessage += `*DATABASE:*\n`;
      debugMessage += `  • Events ngày ${today}: ${dbCount}\n`;
      debugMessage += `  • Tổng events trong DB: ${await this.eventsService.countAll()}\n`;
      
      await ctx.reply(debugMessage, { parse_mode: 'Markdown' });
      
    } catch (error: any) {
      await ctx.reply(`❌ Lỗi debug: ${error.message}`);
    }
  }

  @Command('dbstatus')
  async onDbStatus(@Ctx() ctx: Context) {
    const adminIds = (process.env.ADMIN_CHAT_IDS || '').split(',').map(Number);
    if (!adminIds.includes(ctx.from!.id)) {
      await ctx.reply('⛔ Bạn không có quyền sử dụng lệnh này.');
      return;
    }
    
    await ctx.reply('🔍 Đang kiểm tra database...');
    
    try {
      const totalEvents = await this.eventsService.countAllEvents();
      const distinctDates = await this.eventsService.getDistinctDates();
      const todayUtc = getTodayUTC();
      const todayEvents = await this.eventsService.getEventsByDate(todayUtc);
      
      let message = '📊 **DATABASE STATUS**\n\n';
      message += `📅 Hôm nay (UTC): ${todayUtc}\n`;
      message += `📦 Tổng số events: ${totalEvents}\n`;
      message += `📋 Số events hôm nay: ${todayEvents.length}\n\n`;
      
      if (todayEvents.length > 0) {
        message += `*Sample events hôm nay:*\n`;
        for (const e of todayEvents.slice(0, 5)) {
          message += `  • ${e.event_time} | ${e.currency} | ${e.impact} | ${e.title}\n`;
        }
      }
      
      message += `\n*Tất cả các ngày trong DB:*\n`;
      for (const date of distinctDates.slice(0, 30)) {
        message += `  • ${date}\n`;
      }
      if (distinctDates.length > 30) {
        message += `  ... và ${distinctDates.length - 30} ngày khác\n`;
      }
      
      await ctx.reply(message, { parse_mode: 'Markdown' });
      
    } catch (error: any) {
      await ctx.reply(`❌ Lỗi: ${error.message}`);
    }
  }
}
