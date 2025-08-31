import { Telegraf, Context } from "telegraf";
import type { Message } from "telegraf/typings/core/types/typegram";
import { config } from "../config/config";
import { adminAuthService } from "../services/admin-auth.service";
import { startCommand } from "../commands/start.command";
import { logsCommand } from "../commands/logs.command";
import { logoutCommand } from "../commands/logout.command";
import { helpCommand } from "../commands/help.command";
import { statusCommand } from "../commands/status.command";

export class TelegramBot {
  private bot: Telegraf<Context>;

  constructor() {
    this.bot = new Telegraf(config.telegram.botToken);
    this.setupCommands();
  }

  private setupCommands(): void {
    // Register all commands
    this.bot.command("start", startCommand.handler);
    this.bot.command("logs", logsCommand.handler);
    this.bot.command("logout", logoutCommand.handler);
    this.bot.command("help", helpCommand.handler);
    this.bot.command("status", statusCommand.handler);

    // Handle contact sharing (phone number)
    this.bot.on("contact", this.handleContact.bind(this));

    // Handle text messages
    this.bot.on("text", this.handleTextMessage.bind(this));
  }

  private async handleContact(
    ctx: Context & { message: Message.ContactMessage }
  ): Promise<void> {
    try {
      const contact = ctx.message.contact;
      if (!contact) {
        await ctx.reply(
          "❌ هیچ اطلاعات تماسی دریافت نشد. لطفاً دوباره تلاش کنید."
        );
        return;
      }

      const phoneNumber = contact.phone_number;
      const chatId = ctx.chat?.id;

      if (!chatId) {
        await ctx.reply(
          "❌ قادر به شناسایی چت نیستیم. لطفاً دوباره تلاش کنید."
        );
        return;
      }

      // Remove the phone number keyboard
      await ctx.reply("⏳ در حال تأیید دسترسی ادمین...", {
        reply_markup: { remove_keyboard: true },
      });

      // Verify if this phone number belongs to an admin
      const isAdmin = adminAuthService.verifyAdminByPhone(phoneNumber);

      if (isAdmin) {
        // Create admin session
        adminAuthService.createAdminSession(phoneNumber, chatId.toString());

        await ctx.reply(
          `✅ <b>دسترسی ادمین تأیید شد!</b>\n\n` +
            `خوش آمدید! شماره تلفن ${phoneNumber} شما به عنوان ادمین تأیید شده است.\n\n` +
            `اکنون می‌توانید از دستورات زیر استفاده کنید:\n` +
            `• /logs - مشاهده لاگ‌های تراکنش‌های ناموفق\n` +
            `• /status - بررسی وضعیت سیستم\n` +
            `• /logout - پایان دادن به جلسه\n` +
            `• /help - نمایش دستورات موجود`,
          { parse_mode: "HTML" }
        );
      } else {
        await ctx.reply(
          `❌ <b>دسترسی رد شد</b>\n\n` +
            `شماره تلفن ${phoneNumber} در لیست ادمین‌ها نیست.\n\n` +
            `لطفاً با مدیر سیستم تماس بگیرید تا به لیست ادمین‌ها اضافه شوید.`,
          { parse_mode: "HTML" }
        );
      }
    } catch (error) {
      await ctx.reply(
        "❌ خطایی در حین پردازش اطلاعات تماس شما رخ داد. لطفاً دوباره تلاش کنید."
      );
    }
  }

  private async handleTextMessage(
    ctx: Context & { message: Message.TextMessage }
  ): Promise<void> {
    try {
      const text = ctx.message.text;
      if (!text || text.startsWith("/")) return;

      const chatId = ctx.chat?.id;
      if (!chatId) return;

      // Check if user is authenticated
      const session = adminAuthService.getAdminSession(chatId.toString());

      if (!session) {
        await ctx.reply(
          "❌ شما به عنوان ادمین احراز هویت نشده‌اید.\n\n" +
            "لطفاً از /start برای شروع فرآیند احراز هویت استفاده کنید."
        );
        return;
      }

      // If authenticated, provide helpful response
      await ctx.reply(
        "💡 می‌توانید از دستورات زیر استفاده کنید:\n\n" +
          "• /logs - مشاهده لاگ‌های تراکنش‌های ناموفق\n" +
          "• /status - بررسی وضعیت سیستم\n" +
          "• /logout - پایان دادن به جلسه\n" +
          "• /help - نمایش دستورات موجود"
      );
    } catch (error) {
      await ctx.reply(
        "❌ خطایی در حین پردازش پیام شما رخ داد. لطفاً دوباره تلاش کنید."
      );
    }
  }

  public async start(): Promise<void> {
    try {
      // Set bot commands for better UX
      const botCommands = [
        { command: "start", description: "شروع ربات و احراز هویت ادمین" },
        { command: "logs", description: "مشاهده تراکنش‌های ناموفق" },
        { command: "status", description: "وضعیت ربات" },
        { command: "logout", description: "خروج از ربات" },
        { command: "help", description: "راهنما" },
      ];

      await this.bot.telegram.setMyCommands(botCommands);

      // Start the bot
      await this.bot.launch();

      // Enable graceful stop
      process.once("SIGINT", () => this.stop());
      process.once("SIGTERM", () => this.stop());
    } catch (error) {
      console.error("❌ Failed to start Telegram bot:", error);
      throw error;
    }
  }

  /**
   * Send failed transaction alert to a specific admin chat
   */
  public async sendFailedTransactionAlert(
    chatId: string,
    message: string,
    priority: string = "normal"
  ): Promise<void> {
    try {
      // Add priority indicator to message
      const priorityEmoji =
        {
          low: "🔵",
          normal: "📱",
          high: "🚨",
        }[priority] || "📱";

      const formattedMessage = `${priorityEmoji} <b>هشدار تراکنش ناموفق</b>\n\n${message}`;

      await this.bot.telegram.sendMessage(chatId, formattedMessage, {
        parse_mode: "HTML",
      });
    } catch (error) {
      console.error(
        `❌ Failed to send failed transaction alert to chat ${chatId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Send failed transaction alert to all active admin sessions
   */
  public async sendFailedTransactionAlertToAllAdmins(
    message: string,
    priority: string = "normal"
  ): Promise<number> {
    try {
      const activeSessions = adminAuthService.getActiveAdminSessions();
      let sentCount = 0;

      for (const session of activeSessions) {
        try {
          await this.sendFailedTransactionAlert(
            session.chatId,
            message,
            priority
          );
          sentCount++;
        } catch (error) {
          console.error(
            `Failed to send failed transaction alert to admin ${session.phoneNumber}:`,
            error
          );
        }
      }

      return sentCount;
    } catch (error) {
      console.error("Error sending notifications to all admins:", error);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    try {
      await this.bot.stop("SIGTERM");
    } catch (error) {}
  }
}

export const telegramBot = new TelegramBot();
