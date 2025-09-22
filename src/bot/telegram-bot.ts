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
import { processedInvoiceService } from "../services/processed-invoice.service";

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
            text: "✅ تایید",
            callback_data: `crypto:${INVOICE_STATUS.PAID}:${trackId}`,
          },
          {
            text: "❌ رد",
            callback_data: `crypto:${INVOICE_STATUS.REJECTED}:${trackId}`,
          },
        ],
      ],
    };
  }

  // Add this helper below buildCryptoInlineKeyboard(...)
  private buildNoRefInlineKeyboard(
    trackId: string,
    status: INVOICE_STATUS
  ): InlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [
          {
            text: "📎 شناسه مرجع ندارم",
            // format: crypto_ref:noref:<status>:<trackId>
            callback_data: `crypto_ref:noref:${status}:${trackId}`,
          },
        ],
      ],
    };
  }

  // Build keyboard for already processed invoices
  private buildProcessedInlineKeyboard(
    trackId: string,
    status: INVOICE_STATUS,
    processedBy: string
  ): InlineKeyboardMarkup {
    const statusEmoji = status === INVOICE_STATUS.PAID ? "✅" : "❌";
    const statusText = status === INVOICE_STATUS.PAID ? "تایید شده" : "رد شده";

    return {
      inline_keyboard: [
        [
          {
            text: `${statusEmoji} ${statusText} توسط ${processedBy}`,
            callback_data: `processed:${trackId}`, // Non-actionable callback
          },
        ],
      ],
    };
  }

  // Build read-only keyboard for non-crypto-authorized admins
  private buildReadOnlyInlineKeyboard(trackId: string): InlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [
          {
            text: "👁️ مشاهده وضعیت",
            callback_data: `processed:${trackId}`, // Non-actionable callback
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
    // Check if this invoice has already been processed
    const processedInvoice = await processedInvoiceService.isProcessed(trackId);

    let replyMarkup;
    if (processedInvoice) {
      // Show processed status instead of action buttons
      replyMarkup = this.buildProcessedInlineKeyboard(
        trackId,
        processedInvoice.status,
        processedInvoice.processedBy
      );
    } else {
      // Check if this admin is crypto-authorized to show action buttons
      const session = await adminAuthService.getAdminSession(chatId);
      if (
        session &&
        adminAuthService.isCryptoAuthorizedAdmin(session.phoneNumber)
      ) {
        // Show action buttons for crypto-authorized admins
        replyMarkup = this.buildCryptoInlineKeyboard(trackId);
      } else {
        // Show read-only status for non-crypto-authorized admins
        replyMarkup = this.buildReadOnlyInlineKeyboard(trackId);
      }
    }

    await this.bot.telegram.sendMessage(chatId, message, {
      parse_mode: "HTML",
      reply_markup: replyMarkup,
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
      // Send crypto alerts to ALL admins, but only crypto-authorized admins can take actions
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

      const session = await adminAuthService.getAdminSession(chatId.toString());
      if (!session) {
        await ctx.answerCbQuery("ابتدا با /start احراز هویت کنید");
        return;
      }

      if (!adminAuthService.isCryptoAuthorizedAdmin(session.phoneNumber)) {
        await ctx.answerCbQuery(
          "شما مجوز تغییر وضعیت تراکنش‌های ارز دیجیتال را ندارید"
        );
        return;
      }

      const cq: any = (ctx as any).callbackQuery;
      const data: string | undefined = cq && "data" in cq ? cq.data : undefined;
      if (!data) {
        await ctx.answerCbQuery();
        return;
      }

      // New path: user clicked "شناسه مرجع ندارم"
      if (data.startsWith("crypto_ref:")) {
        // format: crypto_ref:noref:<status>:<trackId>
        const [, refType, statusRaw, trackId] = data.split(":");

        if (refType !== "noref") {
          await ctx.answerCbQuery("داده نامعتبر است");
          return;
        }

        const allowed = new Set(Object.values(INVOICE_STATUS));
        if (
          !statusRaw ||
          !trackId ||
          !allowed.has(statusRaw as INVOICE_STATUS)
        ) {
          await ctx.answerCbQuery("داده نامعتبر است");
          return;
        }

        // Check if invoice is already processed
        const processedInvoice = await processedInvoiceService.isProcessed(
          trackId
        );
        if (processedInvoice) {
          await ctx.answerCbQuery(
            `این فاکتور قبلاً توسط ${processedInvoice.processedBy} پردازش شده است`
          );
          return;
        }

        // Immediately update with referenceNumber "000000"
        const ok = await skenasApiService.updateCryptoInvoiceStatus({
          trackId,
          status: statusRaw as any,
          referenceNumber: "000000",
        });

        if (ok) {
          // Mark as processed by this admin
          await processedInvoiceService.markAsProcessed(
            trackId,
            statusRaw as INVOICE_STATUS,
            session.phoneNumber,
            "000000"
          );

          try {
            await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
          } catch {}

          await pendingActionService.clear(chatId.toString());
          await ctx.answerCbQuery("ثبت شد");
          await ctx.reply(
            `✅ به‌روزرسانی انجام شد (بدون شناسه مرجع).\n` +
              `🆔 TrackId: <code>${trackId}</code>\n` +
              `📌 Status: <b>${statusRaw.toUpperCase()}</b>\n` +
              `🔗 Ref: <code>000000</code>`,
            { parse_mode: "HTML" }
          );
        } else {
          await ctx.answerCbQuery("خطا در به‌روزرسانی");
          await ctx.reply(
            `❌ به‌روزرسانی وضعیت ناموفق بود. لطفاً لاگ‌ها را بررسی کنید یا دوباره تلاش کنید.`
          );
        }
        return;
      }

      // Existing path: status selection
      if (data.startsWith("crypto:")) {
        // format: crypto:<status>:<trackId>
        const [, statusRaw, trackId] = data.split(":");

        const allowed = new Set(Object.values(INVOICE_STATUS));
        if (
          !statusRaw ||
          !trackId ||
          !allowed.has(statusRaw as INVOICE_STATUS)
        ) {
          await ctx.answerCbQuery("داده نامعتبر است");
          return;
        }

        // Check if invoice is already processed
        const processedInvoice = await processedInvoiceService.isProcessed(
          trackId
        );
        if (processedInvoice) {
          await ctx.answerCbQuery(
            `این فاکتور قبلاً توسط ${processedInvoice.processedBy} پردازش شده است`
          );
          return;
        }

        await pendingActionService.clear(chatId.toString());
        await pendingActionService.set(chatId.toString(), {
          kind: "crypto_confirm",
          status: statusRaw as INVOICE_STATUS,
          trackId,
        });

        try {
          await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
        } catch {}

        await ctx.answerCbQuery("وضعیت انتخاب شد");
        await ctx.reply(
          "🔎 لطفاً شناسه مرجع (Reference ID) را وارد کنید.\n" +
            "اگر ندارید، دکمهٔ «شناسه مرجع ندارم» را بزنید.",
          {
            parse_mode: "Markdown",
            reply_markup: this.buildNoRefInlineKeyboard(
              trackId,
              statusRaw as INVOICE_STATUS
            ),
          }
        );
        return;
      }

      // Handle processed invoice info requests
      if (data.startsWith("processed:")) {
        const [, trackId] = data.split(":");
        if (!trackId) {
          await ctx.answerCbQuery("داده نامعتبر است");
          return;
        }

        const processedInvoice = await processedInvoiceService.isProcessed(
          trackId
        );
        if (processedInvoice) {
          const statusText =
            processedInvoice.status === INVOICE_STATUS.PAID
              ? "تایید شده"
              : "رد شده";
          const statusEmoji =
            processedInvoice.status === INVOICE_STATUS.PAID ? "✅" : "❌";

          await ctx.answerCbQuery(
            `${statusEmoji} ${statusText} توسط ${
              processedInvoice.processedBy
            } در ${processedInvoice.processedAt.toLocaleString("fa-IR")}`
          );
        } else {
          await ctx.answerCbQuery("اطلاعات فاکتور یافت نشد");
        }
        return;
      }

      await ctx.answerCbQuery();
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
        const trimmedText = text?.trim();
        const referenceId = trimmedText === "0" ? undefined : trimmedText;

        // Validate referenceId if provided (should only contain digits 0-9)
        if (referenceId && !/^[0-9]+$/.test(referenceId)) {
          await ctx.reply(
            "❌ شناسه مرجع باید فقط شامل اعداد باشد.\n" +
              "لطفاً شناسه مرجع صحیح را وارد کنید یا برای عدم وجود شناسه، عدد `0` ارسال کنید.",
            { parse_mode: "Markdown" }
          );
          return;
        }

        const ok = await skenasApiService.updateCryptoInvoiceStatus({
          trackId: pending.trackId,
          status: pending.status as any, // server: 'paid' | 'rejected' | 'pending' | 'validating'
          referenceNumber: referenceId,
        });

        if (ok) {
          // Mark as processed by this admin
          await processedInvoiceService.markAsProcessed(
            pending.trackId,
            pending.status as INVOICE_STATUS,
            session.phoneNumber,
            referenceId
          );

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
      console.log(`🔍 Found ${activeSessions.length} active admin sessions`);

      if (activeSessions.length === 0) {
        console.warn(
          "⚠️ No active admin sessions found - notifications cannot be sent"
        );
        return 0;
      }

      let sentCount = 0;

      for (const session of activeSessions) {
        try {
          console.log(
            `📤 Sending failed transaction alert to admin ${session.phoneNumber} (chatId: ${session.chatId})`
          );
          await this.sendFailedTransactionAlert(
            session.chatId,
            message,
            priority
          );
          sentCount++;
          console.log(`✅ Successfully sent to admin ${session.phoneNumber}`);
        } catch (error) {
          console.error(
            `❌ Failed to send failed transaction alert to admin ${session.phoneNumber}:`,
            error
          );
        }
      }

      console.log(
        `📊 Total sent: ${sentCount}/${activeSessions.length} notifications`
      );
      return sentCount;
    } catch (error) {
      console.error("❌ Error sending notifications to all admins:", error);
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
