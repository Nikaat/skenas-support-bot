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
          "❌ No contact information received. Please try again."
        );
        return;
      }

      const phoneNumber = contact.phone_number;
      const chatId = ctx.chat?.id;

      if (!chatId) {
        await ctx.reply("❌ Unable to identify chat. Please try again.");
        return;
      }

      // Remove the phone number keyboard
      await ctx.reply("⏳ Verifying admin access...", {
        reply_markup: { remove_keyboard: true },
      });

      // Verify if this phone number belongs to an admin
      const isAdmin = adminAuthService.verifyAdminByPhone(phoneNumber);

      if (isAdmin) {
        // Create admin session
        adminAuthService.createAdminSession(phoneNumber, chatId.toString());

        await ctx.reply(
          `✅ <b>Admin Access Granted!</b>\n\n` +
            `Welcome! Your phone number ${phoneNumber} is verified as admin.\n\n` +
            `You can now use the following commands:\n` +
            `• /logs - View failed transaction logs\n` +
            `• /status - Check system status\n` +
            `• /logout - End your session\n` +
            `• /help - Show available commands`,
          { parse_mode: "HTML" }
        );
      } else {
        await ctx.reply(
          `❌ <b>Access Denied</b>\n\n` +
            `The phone number ${phoneNumber} is not in the admin list.\n\n` +
            `Please contact your system administrator to be added to the admin list.`,
          { parse_mode: "HTML" }
        );
      }
    } catch (error) {
      await ctx.reply(
        "❌ An error occurred while processing your contact information. Please try again."
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
          "❌ You are not authenticated as an admin.\n\n" +
            "Please use /start to begin the authentication process."
        );
        return;
      }

      // If authenticated, provide helpful response
      await ctx.reply(
        "💡 You can use the following commands:\n\n" +
          "• /logs - View failed transaction logs\n" +
          "• /status - Check system status\n" +
          "• /logout - End your session\n" +
          "• /help - Show available commands"
      );
    } catch (error) {
      await ctx.reply(
        "❌ An error occurred while processing your message. Please try again."
      );
    }
  }

  public async start(): Promise<void> {
    try {
      // Set bot commands for better UX
      const botCommands = [
        { command: "start", description: "Start bot and verify admin access" },
        { command: "logs", description: "View failed transaction logs" },
        { command: "status", description: "Check system status" },
        { command: "logout", description: "End admin session" },
        { command: "help", description: "Show available commands" },
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
   * Send notification to a specific chat
   */
  public async sendNotificationToChat(
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

      const formattedMessage = `${priorityEmoji} <b>Admin Notification</b>\n\n${message}`;

      await this.bot.telegram.sendMessage(chatId, formattedMessage, {
        parse_mode: "HTML",
      });

      console.log();
    } catch (error) {
      console.error(`❌ Failed to send notification to chat ${chatId}:`, error);
      throw error;
    }
  }

  /**
   * Send notification to all active admin sessions
   */
  public async sendNotificationToAllAdmins(
    message: string,
    priority: string = "normal"
  ): Promise<number> {
    try {
      const activeSessions = adminAuthService.getActiveAdminSessions();
      let sentCount = 0;

      for (const session of activeSessions) {
        try {
          await this.sendNotificationToChat(session.chatId, message, priority);
          sentCount++;
        } catch (error) {
          console.error(
            `Failed to send notification to admin ${session.phoneNumber}:`,
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
