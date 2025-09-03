import { Telegraf, Context } from "telegraf";
import type {
  InlineKeyboardMarkup,
  Message,
} from "telegraf/typings/core/types/typegram";
import { config } from "../config/config";
import { adminAuthService } from "../services/admin-auth.service";
import { startCommand } from "../commands/start.command";
import { logsCommand } from "../commands/logs.command";
import { logoutCommand } from "../commands/logout.command";
import { helpCommand } from "../commands/help.command";
import { statusCommand } from "../commands/status.command";
import { INVOICE_STATUS } from "../types";
import { pendingActionService } from "../services/pending-action.service";
import { skenasApiService } from "../services/skenas-api.service";

function normalizePhone(p: string): string {
  // Normalize to "+<country><number>" (E.164-ish)
  let s = (p || "").replace(/\D/g, "");
  if (s.startsWith("00")) s = s.slice(2);
  if (s && !s.startsWith("+")) s = "+" + s;
  return s;
}

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

    // Handle text messages (single definition!)
    this.bot.on("text", this.handleTextMessage.bind(this));

    // Handle inline button callbacks
    this.bot.on("callback_query", this.handleCallbackQuery.bind(this));
  }

  // ---------- Inline keyboard for crypto ----------
  private buildCryptoInlineKeyboard(trackId: string): InlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [
          {
            text: "✅ تایید (PAID)",
            callback_data: `crypto:${INVOICE_STATUS.PAID}:${trackId}`,
          },
          {
            text: "🟡 درحال اعتبارسنجی",
            callback_data: `crypto:${INVOICE_STATUS.VALIDATING}:${trackId}`,
          },
        ],
        [
          {
            text: "⏳ معلق (PENDING)",
            callback_data: `crypto:${INVOICE_STATUS.PENDING}:${trackId}`,
          },
          {
            text: "❌ رد (REJECTED)",
            callback_data: `crypto:${INVOICE_STATUS.REJECTED}:${trackId}`,
          },
        ],
      ],
    };
  }

  // ---------- Crypto alerts (single + broadcast) ----------
  public async sendCryptoTransactionAlert(
    chatId: string,
    message: string,
    trackId: string,
    priority: string = "normal"
  ): Promise<void> {
    await this.bot.telegram.sendMessage(chatId, message, {
      parse_mode: "HTML",
      reply_markup: this.buildCryptoInlineKeyboard(trackId),
    });
  }

  public async sendCryptoTransactionAlertToAllAdmins(
    message: string,
    trackId: string,
    priority: string = "normal"
  ): Promise<number> {
    const activeSessions = await adminAuthService.getActiveAdminSessions();
    let sent = 0;
    for (const s of activeSessions) {
      try {
        await this.sendCryptoTransactionAlert(
          s.chatId,
          message,
          trackId,
          priority
        );
        sent++;
      } catch (e) {
        console.error(`Failed to send crypto alert to ${s.phoneNumber}`, e);
      }
    }
    return sent;
  }

  // ---------- Callback query handler ----------
  private async handleCallbackQuery(ctx: Context): Promise<void> {
    try {
      const chatId = ctx.chat?.id;
      if (!chatId) return;

      // ensure admin session exists
      const session = await adminAuthService.getAdminSession(chatId.toString());
      if (!session) {
        await ctx.answerCbQuery("ابتدا با /start احراز هویت کنید");
        return;
      }

      const cq: any = (ctx as any).callbackQuery;
      const data: string | undefined = cq && "data" in cq ? cq.data : undefined;
      if (!data || !data.startsWith("crypto:")) {
        await ctx.answerCbQuery();
        return;
      }

      // format: crypto:<status>:<trackId>
      const [, statusRaw, trackId] = data.split(":");

      const allowed = new Set(Object.values(INVOICE_STATUS));
      if (!statusRaw || !trackId || !allowed.has(statusRaw as INVOICE_STATUS)) {
        await ctx.answerCbQuery("داده نامعتبر است");
        return;
      }

      // Clear any previous pending state and set new one
      await pendingActionService.clear(chatId.toString());
      await pendingActionService.set(chatId.toString(), {
        kind: "crypto_confirm",
        status: statusRaw as INVOICE_STATUS,
        trackId,
      });

      // Optional: remove buttons from original message
      try {
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
      } catch {}

      await ctx.answerCbQuery("وضعیت انتخاب شد");
      await ctx.reply(
        "🔎 لطفاً شناسه مرجع (Reference ID) را وارد کنید.\n" +
          "اگر ندارید، یک خط تیره `-` ارسال کنید.",
        { parse_mode: "Markdown" }
      );
    } catch (error) {
      console.error("Callback handler error:", error);
      try {
        await ctx.answerCbQuery("خطای داخلی");
      } catch {}
    }
  }

  // ---------- Text handler (includes pending action flow) ----------
  private async handleTextMessage(
    ctx: Context & { message: Message.TextMessage }
  ): Promise<void> {
    try {
      const text = ctx.message.text;
      const chatId = ctx.chat?.id;
      if (!chatId) return;

      // If this message is a command, ignore here (commands already handled)
      if (text?.startsWith("/")) return;

      // Check admin
      const session = await adminAuthService.getAdminSession(chatId.toString());
      if (!session) {
        await ctx.reply(
          "❌ شما به عنوان ادمین احراز هویت نشده‌اید.\n\n" +
            "لطفاً از /start برای شروع فرآیند احراز هویت استفاده کنید."
        );
        return;
      }

      // If we have a pending crypto action, treat text as referenceId
      const pending = await pendingActionService.get(chatId.toString());
      if (pending && pending.kind === "crypto_confirm") {
        const referenceId = text?.trim() === "-" ? undefined : text?.trim();

        const ok = await skenasApiService.updateCryptoInvoiceStatus({
          trackId: pending.trackId,
          status: pending.status as any, // server: 'paid' | 'rejected' | 'pending' | 'validating'
          referenceNumber: referenceId,
        });

        if (ok) {
          await ctx.reply(
            `✅ به‌روزرسانی فاکتور ارز دیجیتال با موفقیت انجام شد.\n` +
              `🆔 TrackId: <code>${pending.trackId}</code>\n` +
              `📌 Status: <b>${pending.status.toUpperCase()}</b>\n` +
              `🔗 Ref: <code>${referenceId || "—"}</code>`,
            { parse_mode: "HTML" }
          );
        } else {
          await ctx.reply(
            `❌ به‌روزرسانی وضعیت ناموفق بود. لطفاً لاگ‌ها را بررسی کنید یا دوباره تلاش کنید.`
          );
        }

        await pendingActionService.clear(chatId.toString());
        return;
      }

      // No pending action → provide guidance
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

  // ---------- Contact handler (admin auth) ----------
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

      const phoneNumber = normalizePhone(contact.phone_number);
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

  // ---------- Plain failed alerts (non-crypto) ----------
  public async sendFailedTransactionAlert(
    chatId: string,
    message: string,
    priority: string = "normal"
  ): Promise<void> {
    try {
      await this.bot.telegram.sendMessage(chatId, message, {
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

  public async sendFailedTransactionAlertToAllAdmins(
    message: string,
    priority: string = "normal"
  ): Promise<number> {
    try {
      const activeSessions = await adminAuthService.getActiveAdminSessions();
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

  // ---------- Lifecycle ----------
  public async start(): Promise<void> {
    try {
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
      await this.bot.launch();

      process.once("SIGINT", () => this.stop());
      process.once("SIGTERM", () => this.stop());
    } catch (error) {
      console.error("❌ Failed to start Telegram bot:", error);
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
