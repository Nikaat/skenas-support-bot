import { Telegraf, Context } from "telegraf";
import type { Message } from "telegraf/typings/core/types/typegram";
import { config } from "../config/config";
import { adminAuthService } from "../services/admin-auth.service";
import { skenasApiService } from "../services/skenas-api.service";
import { startCommand } from "../commands/start.command";
import { logsCommand } from "../commands/logs.command";
import { logoutCommand } from "../commands/logout.command";
import { helpCommand } from "../commands/help.command";
import { statusCommand } from "../commands/status.command";
import { INVOICE_STATUS } from "../types";

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

    // Handle callback queries (for glass buttons)
    this.bot.on("callback_query", this.handleCallbackQuery.bind(this));
  }

  private async handleContact(
    ctx: Context & { message: Message.ContactMessage }
  ): Promise<void> {
    try {
      const contact = ctx.message.contact;
      if (!contact || !contact.phone_number) {
        await ctx.reply(
          "❌ لطفاً از دکمه 'اشتراک‌گذاری شماره تلفن' استفاده کنید.\n\n" +
            "شماره تلفن را به صورت دستی تایپ نکنید."
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
        await adminAuthService.createAdminSession(
          phoneNumber,
          chatId.toString()
        );

        await ctx.reply(
          `✅ <b>دسترسی ادمین تأیید شد!</b>\n\n` +
            `خوش آمدید! شماره تلفن ${phoneNumber} شما به عنوان ادمین تأیید شده است.\n\n` +
            `اکنون می‌توانید از دستورات زیر استفاده کنید:\n` +
            `• /logs - مشاهده لاگ‌های تراکنش‌های ناموفق و درحال بررسی\n` +
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
      const session = await adminAuthService.getAdminSession(chatId.toString());

      if (!session) {
        await ctx.reply(
          "❌ شما به عنوان ادمین احراز هویت نشده‌اید.\n\n" +
            "لطفاً از /start برای شروع فرآیند احراز هویت استفاده کنید."
        );
        return;
      }

      // Check if this is a reference number input
      // For now, we'll use a simple approach - in a real implementation,
      // you'd want to store pending reference requests in Redis
      if (this.isReferenceNumberInput(text)) {
        await ctx.reply(
          "📝 شماره مرجع دریافت شد. لطفاً از دکمه تأیید در پیام قبلی استفاده کنید."
        );
        return;
      }

      // If authenticated, provide helpful response
      await ctx.reply(
        "💡 می‌توانید از دستورات زیر استفاده کنید:\n\n" +
          "• /logs - مشاهده لاگ‌های تراکنش‌های ناموفق و درحال بررسی\n" +
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

  private isReferenceNumberInput(text: string): boolean {
    // Simple check - in a real implementation, you'd want to check against
    // stored pending reference requests
    return text.length > 3 && /^[a-zA-Z0-9]+$/.test(text);
  }

  private async handleCallbackQuery(ctx: Context): Promise<void> {
    try {
      const callbackQuery = ctx.callbackQuery;
      if (!callbackQuery || !("data" in callbackQuery)) return;

      const data = callbackQuery.data;
      const chatId = ctx.chat?.id;
      const messageId =
        "message" in callbackQuery
          ? callbackQuery.message?.message_id
          : undefined;

      if (!chatId || !messageId) return;

      // Check if user is authenticated as admin
      const session = await adminAuthService.getAdminSession(chatId.toString());
      if (!session) {
        await ctx.answerCbQuery("❌ شما به عنوان ادمین احراز هویت نشده‌اید.");
        return;
      }

      // Handle confirm button click
      if (data.startsWith("confirm_")) {
        const trackId = data.replace("confirm_", "");
        await this.showStatusSelectionMenu(ctx, trackId, messageId);
        return;
      }

      // Handle status selection
      if (data.startsWith("status_")) {
        const [_, trackId, status] = data.split("_");
        await this.handleStatusSelection(
          ctx,
          trackId,
          status as INVOICE_STATUS,
          messageId
        );
        return;
      }

      // Handle reference number input
      if (data.startsWith("ref_")) {
        const [_, trackId, status] = data.split("_");
        await this.requestReferenceNumber(
          ctx,
          trackId,
          status as INVOICE_STATUS,
          messageId
        );
        return;
      }

      // Handle final confirmation
      if (data.startsWith("final_")) {
        const [_, trackId, status] = data.split("_");
        await this.finalizeInvoiceUpdate(
          ctx,
          trackId,
          status as INVOICE_STATUS,
          messageId
        );
        return;
      }

      await ctx.answerCbQuery("❌ عملیات نامعتبر");
    } catch (error) {
      console.error("Error handling callback query:", error);
      await ctx.answerCbQuery("❌ خطایی رخ داد");
    }
  }

  public async start(): Promise<void> {
    try {
      // Set bot commands for better UX
      const botCommands = [
        { command: "start", description: "شروع ربات و احراز هویت ادمین" },
        {
          command: "logs",
          description: "مشاهده تراکنش‌های ناموفق و درحال بررسی",
        },
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
   * Send failed transaction alert to a specific admin chat with glass button
   */
  public async sendFailedTransactionAlert(
    chatId: string,
    message: string,
    priority: string = "normal",
    trackId?: string
  ): Promise<void> {
    try {
      const keyboard = trackId
        ? {
            inline_keyboard: [
              [
                {
                  text: "🔍 تأیید تراکنش",
                  callback_data: `confirm_${trackId}`,
                },
              ],
            ],
          }
        : undefined;

      await this.bot.telegram.sendMessage(chatId, message, {
        parse_mode: "HTML",
        reply_markup: keyboard,
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
    priority: string = "normal",
    trackId?: string
  ): Promise<number> {
    try {
      const activeSessions = await adminAuthService.getActiveAdminSessions();
      let sentCount = 0;

      for (const session of activeSessions) {
        try {
          await this.sendFailedTransactionAlert(
            session.chatId,
            message,
            priority,
            trackId
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

  private async showStatusSelectionMenu(
    ctx: Context,
    trackId: string,
    messageId: number
  ): Promise<void> {
    try {
      const keyboard = {
        inline_keyboard: [
          [
            {
              text: "✅ پرداخت شده",
              callback_data: `status_${trackId}_${INVOICE_STATUS.PAID}`,
            },
            {
              text: "❌ رد شده",
              callback_data: `status_${trackId}_${INVOICE_STATUS.REJECTED}`,
            },
          ],
          [
            {
              text: "⏳ در انتظار",
              callback_data: `status_${trackId}_${INVOICE_STATUS.PENDING}`,
            },
            {
              text: "🔍 در حال بررسی",
              callback_data: `status_${trackId}_${INVOICE_STATUS.VALIDATING}`,
            },
          ],
        ],
      };

      await ctx.telegram.editMessageReplyMarkup(
        ctx.chat?.id,
        messageId,
        undefined,
        keyboard
      );

      await ctx.answerCbQuery("لطفاً وضعیت تراکنش را انتخاب کنید");
    } catch (error) {
      console.error("Error showing status selection menu:", error);
      await ctx.answerCbQuery("❌ خطایی رخ داد");
    }
  }

  private async handleStatusSelection(
    ctx: Context,
    trackId: string,
    status: INVOICE_STATUS,
    messageId: number
  ): Promise<void> {
    try {
      const statusText = this.getStatusText(status);

      const keyboard = {
        inline_keyboard: [
          [
            {
              text: "📝 افزودن شماره مرجع",
              callback_data: `ref_${trackId}_${status}`,
            },
            {
              text: "✅ تأیید بدون مرجع",
              callback_data: `final_${trackId}_${status}`,
            },
          ],
        ],
      };

      await ctx.telegram.editMessageText(
        ctx.chat?.id,
        messageId,
        undefined,
        `🔍 <b>تأیید تراکنش</b>\n\n` +
          `📋 <b>شناسه تراکنش:</b> <code>${trackId}</code>\n` +
          `📊 <b>وضعیت انتخابی:</b> ${statusText}\n\n` +
          `آیا می‌خواهید شماره مرجع اضافه کنید؟`,
        {
          parse_mode: "HTML",
          reply_markup: keyboard,
        }
      );

      await ctx.answerCbQuery(`وضعیت ${statusText} انتخاب شد`);
    } catch (error) {
      console.error("Error handling status selection:", error);
      await ctx.answerCbQuery("❌ خطایی رخ داد");
    }
  }

  private async requestReferenceNumber(
    ctx: Context,
    trackId: string,
    status: INVOICE_STATUS,
    messageId: number
  ): Promise<void> {
    try {
      const statusText = this.getStatusText(status);

      await ctx.telegram.editMessageText(
        ctx.chat?.id,
        messageId,
        undefined,
        `📝 <b>شماره مرجع</b>\n\n` +
          `📋 <b>شناسه تراکنش:</b> <code>${trackId}</code>\n` +
          `📊 <b>وضعیت:</b> ${statusText}\n\n` +
          `لطفاً شماره مرجع را ارسال کنید:`,
        {
          parse_mode: "HTML",
        }
      );

      // Store the pending reference request in Redis or memory
      // For now, we'll use a simple approach with a timeout
      await ctx.answerCbQuery("لطفاً شماره مرجع را ارسال کنید");
    } catch (error) {
      console.error("Error requesting reference number:", error);
      await ctx.answerCbQuery("❌ خطایی رخ داد");
    }
  }

  private async finalizeInvoiceUpdate(
    ctx: Context,
    trackId: string,
    status: INVOICE_STATUS,
    messageId: number
  ): Promise<void> {
    try {
      const statusText = this.getStatusText(status);

      // Call the Skenas API to update the invoice status
      const result = await skenasApiService.updateInvoiceStatus({
        trackId,
        newStatus: status,
        // referenceId is optional and can be added later if needed
      });

      if (result.success) {
        await ctx.telegram.editMessageText(
          ctx.chat?.id,
          messageId,
          undefined,
          `✅ <b>تراکنش با موفقیت به‌روزرسانی شد</b>\n\n` +
            `📋 <b>شناسه تراکنش:</b> <code>${trackId}</code>\n` +
            `📊 <b>وضعیت جدید:</b> ${statusText}\n` +
            `⏰ <b>زمان:</b> ${new Date().toLocaleString("fa-IR")}`,
          {
            parse_mode: "HTML",
          }
        );
        await ctx.answerCbQuery("✅ تراکنش با موفقیت به‌روزرسانی شد");
      } else {
        await ctx.telegram.editMessageText(
          ctx.chat?.id,
          messageId,
          undefined,
          `❌ <b>خطا در به‌روزرسانی تراکنش</b>\n\n` +
            `📋 <b>شناسه تراکنش:</b> <code>${trackId}</code>\n` +
            `📊 <b>وضعیت انتخابی:</b> ${statusText}\n` +
            `⚠️ <b>خطا:</b> ${result.error || "خطای نامشخص"}`,
          {
            parse_mode: "HTML",
          }
        );
        await ctx.answerCbQuery("❌ خطا در به‌روزرسانی تراکنش");
      }
    } catch (error) {
      console.error("Error finalizing invoice update:", error);
      await ctx.answerCbQuery("❌ خطایی رخ داد");
    }
  }

  private getStatusText(status: INVOICE_STATUS): string {
    const statusMap = {
      [INVOICE_STATUS.PAID]: "✅ پرداخت شده",
      [INVOICE_STATUS.REJECTED]: "❌ رد شده",
      [INVOICE_STATUS.PENDING]: "⏳ در انتظار",
      [INVOICE_STATUS.VALIDATING]: "🔍 در حال بررسی",
    };
    return statusMap[status] || status;
  }

  public async stop(): Promise<void> {
    try {
      await this.bot.stop("SIGTERM");
    } catch (error) {}
  }
}

export const telegramBot = new TelegramBot();

// import { Telegraf, Context } from "telegraf";
// import type { Message } from "telegraf/typings/core/types/typegram";
// import { config } from "../config/config";
// import { adminAuthService } from "../services/admin-auth.service";
// import { startCommand } from "../commands/start.command";
// import { logsCommand } from "../commands/logs.command";
// import { logoutCommand } from "../commands/logout.command";
// import { helpCommand } from "../commands/help.command";
// import { statusCommand } from "../commands/status.command";

// export class TelegramBot {
//   private bot: Telegraf<Context>;

//   constructor() {
//     this.bot = new Telegraf(config.telegram.botToken);
//     this.setupCommands();
//   }

//   private setupCommands(): void {
//     // Register all commands
//     this.bot.command("start", startCommand.handler);
//     this.bot.command("logs", logsCommand.handler);
//     this.bot.command("logout", logoutCommand.handler);
//     this.bot.command("help", helpCommand.handler);
//     this.bot.command("status", statusCommand.handler);

//     // Handle contact sharing (phone number)
//     this.bot.on("contact", this.handleContact.bind(this));

//     // Handle text messages
//     this.bot.on("text", this.handleTextMessage.bind(this));
//   }

//   private async handleContact(
//     ctx: Context & { message: Message.ContactMessage }
//   ): Promise<void> {
//     try {
//       const contact = ctx.message.contact;
//       if (!contact || !contact.phone_number) {
//         await ctx.reply(
//           "❌ لطفاً از دکمه 'اشتراک‌گذاری شماره تلفن' استفاده کنید.\n\n" +
//             "شماره تلفن را به صورت دستی تایپ نکنید."
//         );
//         return;
//       }

//       const phoneNumber = contact.phone_number;
//       const chatId = ctx.chat?.id;

//       if (!chatId) {
//         await ctx.reply(
//           "❌ قادر به شناسایی چت نیستیم. لطفاً دوباره تلاش کنید."
//         );
//         return;
//       }

//       // Remove the phone number keyboard
//       await ctx.reply("⏳ در حال تأیید دسترسی ادمین...", {
//         reply_markup: { remove_keyboard: true },
//       });

//       // Verify if this phone number belongs to an admin
//       const isAdmin = adminAuthService.verifyAdminByPhone(phoneNumber);

//       if (isAdmin) {
//         // Create admin session
//         await adminAuthService.createAdminSession(
//           phoneNumber,
//           chatId.toString()
//         );

//         await ctx.reply(
//           `✅ <b>دسترسی ادمین تأیید شد!</b>\n\n` +
//             `خوش آمدید! شماره تلفن ${phoneNumber} شما به عنوان ادمین تأیید شده است.\n\n` +
//             `اکنون می‌توانید از دستورات زیر استفاده کنید:\n` +
//             `• /logs - مشاهده لاگ‌های تراکنش‌های ناموفق و درحال بررسی\n` +
//             `• /status - بررسی وضعیت سیستم\n` +
//             `• /logout - پایان دادن به جلسه\n` +
//             `• /help - نمایش دستورات موجود`,
//           { parse_mode: "HTML" }
//         );
//       } else {
//         await ctx.reply(
//           `❌ <b>دسترسی رد شد</b>\n\n` +
//             `شماره تلفن ${phoneNumber} در لیست ادمین‌ها نیست.\n\n` +
//             `لطفاً با مدیر سیستم تماس بگیرید تا به لیست ادمین‌ها اضافه شوید.`,
//           { parse_mode: "HTML" }
//         );
//       }
//     } catch (error) {
//       await ctx.reply(
//         "❌ خطایی در حین پردازش اطلاعات تماس شما رخ داد. لطفاً دوباره تلاش کنید."
//       );
//     }
//   }

//   private async handleTextMessage(
//     ctx: Context & { message: Message.TextMessage }
//   ): Promise<void> {
//     try {
//       const text = ctx.message.text;
//       if (!text || text.startsWith("/")) return;

//       const chatId = ctx.chat?.id;
//       if (!chatId) return;

//       // Check if user is authenticated
//       const session = await adminAuthService.getAdminSession(chatId.toString());

//       if (!session) {
//         await ctx.reply(
//           "❌ شما به عنوان ادمین احراز هویت نشده‌اید.\n\n" +
//             "لطفاً از /start برای شروع فرآیند احراز هویت استفاده کنید."
//         );
//         return;
//       }

//       // If authenticated, provide helpful response
//       await ctx.reply(
//         "💡 می‌توانید از دستورات زیر استفاده کنید:\n\n" +
//           "• /logs - مشاهده لاگ‌های تراکنش‌های ناموفق و درحال بررسی\n" +
//           "• /status - بررسی وضعیت سیستم\n" +
//           "• /logout - پایان دادن به جلسه\n" +
//           "• /help - نمایش دستورات موجود"
//       );
//     } catch (error) {
//       await ctx.reply(
//         "❌ خطایی در حین پردازش پیام شما رخ داد. لطفاً دوباره تلاش کنید."
//       );
//     }
//   }

//   public async start(): Promise<void> {
//     try {
//       // Set bot commands for better UX
//       const botCommands = [
//         { command: "start", description: "شروع ربات و احراز هویت ادمین" },
//         {
//           command: "logs",
//           description: "مشاهده تراکنش‌های ناموفق و درحال بررسی",
//         },
//         { command: "status", description: "وضعیت ربات" },
//         { command: "logout", description: "خروج از ربات" },
//         { command: "help", description: "راهنما" },
//       ];

//       await this.bot.telegram.setMyCommands(botCommands);

//       // Start the bot
//       await this.bot.launch();

//       // Enable graceful stop
//       process.once("SIGINT", () => this.stop());
//       process.once("SIGTERM", () => this.stop());
//     } catch (error) {
//       console.error("❌ Failed to start Telegram bot:", error);
//       throw error;
//     }
//   }

//   /**
//    * Send failed transaction alert to a specific admin chat
//    */
//   public async sendFailedTransactionAlert(
//     chatId: string,
//     message: string,
//     priority: string = "normal"
//   ): Promise<void> {
//     try {
//       await this.bot.telegram.sendMessage(chatId, message, {
//         parse_mode: "HTML",
//       });
//     } catch (error) {
//       console.error(
//         `❌ Failed to send failed transaction alert to chat ${chatId}:`,
//         error
//       );
//       throw error;
//     }
//   }

//   /**
//    * Send failed transaction alert to all active admin sessions
//    */
//   public async sendFailedTransactionAlertToAllAdmins(
//     message: string,
//     priority: string = "normal"
//   ): Promise<number> {
//     try {
//       const activeSessions = await adminAuthService.getActiveAdminSessions();
//       let sentCount = 0;

//       for (const session of activeSessions) {
//         try {
//           await this.sendFailedTransactionAlert(
//             session.chatId,
//             message,
//             priority
//           );
//           sentCount++;
//         } catch (error) {
//           console.error(
//             `Failed to send failed transaction alert to admin ${session.phoneNumber}:`,
//             error
//           );
//         }
//       }

//       return sentCount;
//     } catch (error) {
//       console.error("Error sending notifications to all admins:", error);
//       throw error;
//     }
//   }

//   public async stop(): Promise<void> {
//     try {
//       await this.bot.stop("SIGTERM");
//     } catch (error) {}
//   }
// }

// export const telegramBot = new TelegramBot();
