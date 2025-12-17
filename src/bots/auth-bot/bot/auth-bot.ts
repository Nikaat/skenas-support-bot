import { Telegraf, Context } from "telegraf";
import type {
  Message,
  InlineKeyboardMarkup,
} from "telegraf/typings/core/types/typegram";
import axios from "axios";
import { config } from "../../../utils/config";
import { authService } from "../services/auth.service";
import { authStatusService } from "../services/auth-status.service";
import { authDecisionService } from "../services/auth-decision.service";
import { pendingAuthActionService } from "../services/pending-auth-action.service";

function normalizePhone(p: string): string {
  // Normalize to "+<country><number>" (E.164-ish)
  let s = (p || "").replace(/\D/g, "");
  if (s.startsWith("00")) s = s.slice(2);
  if (s && !s.startsWith("+")) s = "+" + s;
  return s;
}

export class AuthBot {
  private bot: Telegraf<Context>;

  constructor() {
    this.bot = new Telegraf(config.telegram.authBotToken);
    this.setupCommands();
  }

  private setupCommands(): void {
    // Register commands
    this.bot.command("start", this.handleStart.bind(this));
    this.bot.command("logout", this.handleLogout.bind(this));
    this.bot.command("help", this.handleHelp.bind(this));

    // Handle contact sharing (phone number)
    this.bot.on("contact", this.handleContact.bind(this));

    // Handle text messages
    this.bot.on("text", this.handleTextMessage.bind(this));

    // Handle inline button callbacks
    this.bot.on("callback_query", this.handleCallbackQuery.bind(this));
  }

  // ---------- Command Handlers ----------
  private async handleStart(ctx: Context): Promise<void> {
    try {
      const chatId = ctx.chat?.id;
      if (!chatId) {
        await ctx.reply(
          "❌ قادر به شناسایی چت نیستیم. لطفاً دوباره تلاش کنید."
        );
        return;
      }

      // Check if user already has an active session
      const existingSession = await authService.getAdminSession(
        chatId.toString()
      );

      if (existingSession) {
        await ctx.reply(
          `✅ خوش آمدید! شما قبلاً به عنوان ادمین احراز هویت شده‌اید.\n\n` +
            `از /logout برای پایان دادن به جلسه استفاده کنید.`
        );
        return;
      }

      // Send welcome message with phone number request
      await ctx.reply(
        `🤖 به ربات احراز هویت اسکناس خوش آمدید!\n\n` +
          `این ربات اطلاعات احراز هویت کاربران (ویدیو، عکس و مدارک هویتی) را دریافت کرده و به ادمین‌ها ارسال می‌کند.\n\n` +
          `⚠️ برای ادامه، لطفاً از دکمه زیر استفاده کنید👇`,
        {
          reply_markup: {
            keyboard: [
              [{ text: "📱 اشتراک‌گذاری شماره تلفن", request_contact: true }],
            ],
            resize_keyboard: true,
            one_time_keyboard: true,
            selective: true,
            input_field_placeholder:
              "از دکمه زیر برای اشتراک‌ گذاری شماره تلفن استفاده کنید",
          },
        }
      );
    } catch (error) {
      await ctx.reply("❌ خطایی رخ داد. لطفاً بعداً دوباره تلاش کنید.");
    }
  }

  private async handleLogout(ctx: Context): Promise<void> {
    try {
      const chatId = ctx.chat?.id;
      if (!chatId) {
        await ctx.reply(
          "❌ قادر به شناسایی چت نیستیم. لطفاً دوباره تلاش کنید."
        );
        return;
      }

      const session = await authService.getAdminSession(chatId.toString());
      if (!session) {
        await ctx.reply(
          "❌ شما به عنوان ادمین احراز هویت نشده‌اید.\n\n" +
            "لطفاً از /start برای شروع فرآیند احراز هویت استفاده کنید."
        );
        return;
      }

      await authService.removeAdminSession(chatId.toString());
      await ctx.reply(
        "✅ شما با موفقیت از ربات خارج شدید.\n\n" +
          "برای ورود مجدد، از دستور /start استفاده کنید."
      );
    } catch (error) {
      await ctx.reply(
        "❌ خطایی در حین خروج از ربات رخ داد. لطفاً دوباره تلاش کنید."
      );
    }
  }

  private async handleHelp(ctx: Context): Promise<void> {
    try {
      await ctx.reply(
        "📖 <b>راهنمای ربات احراز هویت</b>\n\n" +
          "این ربات برای دریافت و ارسال اطلاعات احراز هویت کاربران به ادمین‌ها استفاده می‌شود.\n\n" +
          "<b>دستورات موجود:</b>\n" +
          "• /start - شروع ربات و احراز هویت ادمین\n" +
          "• /logout - پایان دادن به جلسه\n" +
          "• /help - نمایش این راهنما\n\n" +
          "اطلاعات احراز هویت از طریق API به این ربات ارسال می‌شود و به صورت خودکار به تمام ادمین‌های فعال ارسال می‌گردد.",
        { parse_mode: "HTML" }
      );
    } catch (error) {
      await ctx.reply("❌ خطایی در نمایش راهنما رخ داد.");
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
      const isAdmin = authService.verifyAdminByPhone(phoneNumber);

      if (isAdmin) {
        // Create admin session
        await authService.createAdminSession(phoneNumber, chatId.toString());

        await ctx.reply(
          `✅ <b>دسترسی ادمین تأیید شد!</b>\n\n` +
            `خوش آمدید! شماره تلفن ${phoneNumber} شما به عنوان ادمین تأیید شده است.\n\n` +
            `اکنون می‌توانید از دستورات زیر استفاده کنید:\n` +
            `• /logout - پایان دادن به جلسه\n` +
            `• /help - نمایش راهنما`,
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

  // ---------- Text handler ----------
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
      const session = await authService.getAdminSession(chatId.toString());
      if (!session) {
        await ctx.reply(
          "❌ شما به عنوان ادمین احراز هویت نشده‌اید.\n\n" +
            "لطفاً از /start برای شروع فرآیند احراز هویت استفاده کنید."
        );
        return;
      }

      // Check for pending custom reason input
      const pendingAction = await pendingAuthActionService.get(
        chatId.toString()
      );
      if (pendingAction && pendingAction.kind === "auth_custom_reason") {
        const customReason = text?.trim() || "";

        // Validate: max 3 words
        const words = customReason.split(/\s+/).filter((w) => w.length > 0);
        if (words.length === 0) {
          await ctx.reply(
            "❌ لطفاً دلیل رد را وارد کنید.\n" + "⚠️ حداکثر ۳ کلمه"
          );
          return;
        }

        if (words.length > 3) {
          await ctx.reply(
            "❌ دلیل رد باید حداکثر ۳ کلمه باشد.\n\n" +
              `شما ${words.length} کلمه وارد کرده‌اید. لطفاً کوتاه‌تر کنید.`
          );
          return;
        }

        // Check if this requestId has already been processed
        const existingDecision = await authDecisionService.getDecision(
          pendingAction.requestId
        );
        if (existingDecision) {
          await pendingAuthActionService.clear(chatId.toString());
          await ctx.reply("این درخواست قبلاً پردازش شده است.");
          return;
        }

        // Update status in main app with custom reason
        const success = await authStatusService.updateAuthStatus(
          pendingAction.userId,
          "registering",
          customReason
        );

        if (success) {
          // Mark as processed
          await authDecisionService.setDecision(
            pendingAction.requestId,
            pendingAction.userId,
            "registering",
            session.phoneNumber
          );

          // Clear pending action
          await pendingAuthActionService.clear(chatId.toString());

          await ctx.reply(
            `❌ <b>درخواست رد شد</b>\n\n` +
              `👤 شناسه کاربر: <code>${pendingAction.userId}</code>\n` +
              `📌 وضعیت: <b>رد شده</b>\n` +
              `📝 دلیل: <b>${customReason}</b>`,
            { parse_mode: "HTML" }
          );
        } else {
          await ctx.reply(
            `❌ به‌روزرسانی وضعیت ناموفق بود. لطفاً دوباره تلاش کنید.`
          );
        }
        return;
      }

      // No pending action → provide guidance
      await ctx.reply(
        "💡 می‌توانید از دستورات زیر استفاده کنید:\n\n" +
          "• /logout - پایان دادن به جلسه\n" +
          "• /help - نمایش دستورات موجود"
      );
    } catch (error) {
      await ctx.reply(
        "❌ خطایی در حین پردازش پیام شما رخ داد. لطفاً دوباره تلاش کنید."
      );
    }
  }

  // ---------- Rejection reasons (max 3 words each) ----------
  private readonly REJECTION_REASONS = [
    "مدرک هویتی نامعتبر",
    "ویدیو نامعتبر",
    "اطلاعات ناقص",
    "عدم تطابق اطلاعات",
    "مدرک غیرقابل خواندن",
    "ویدیو غیرقابل مشاهده",
    "تکرار درخواست",
    "مدرک منقضی شده",
    "مدرک جعلی",
    "ویدیو کوتاه",
    "ویدیو تار",
    "عدم تطابق چهره",
    "کد ملی نامعتبر",
    "تاریخ تولد نامعتبر",
    "نام نامعتبر",
    "مدرک قدیمی",
    "ویدیو بدون صدا",
    "مدرک آسیب دیده",
    "اطلاعات نادرست",
    "مدرک غیرواضح",
    "ویدیو نامرتبط",
    "مدرک ناقص",
    "ویدیو ناقص",
    "عدم تطابق مدرک",
    "مدرک تکراری",
  ];

  // ---------- Inline keyboard for auth requests ----------
  private buildAuthInlineKeyboard(
    userId: string,
    requestId: string
  ): InlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [
          {
            text: "✅ تایید",
            callback_data: `auth:verified:${requestId}:${userId}`,
          },
          {
            text: "❌ رد",
            callback_data: `auth:reject:${requestId}:${userId}`,
          },
        ],
      ],
    };
  }

  // ---------- Inline keyboard for rejection reasons ----------
  private readonly REASONS_PER_PAGE = 6;

  private buildRejectionReasonKeyboard(
    requestId: string,
    userId: string,
    page: number = 0
  ): InlineKeyboardMarkup {
    const totalReasons = this.REJECTION_REASONS.length;
    const totalPages = Math.ceil(totalReasons / this.REASONS_PER_PAGE);
    const currentPage = Math.max(0, Math.min(page, totalPages - 1));

    const startIndex = currentPage * this.REASONS_PER_PAGE;
    const endIndex = Math.min(startIndex + this.REASONS_PER_PAGE, totalReasons);
    const reasonsForPage = this.REJECTION_REASONS.slice(startIndex, endIndex);

    // Build reason buttons for current page
    const buttons = reasonsForPage.map((reason, localIndex) => {
      const globalIndex = startIndex + localIndex;
      return [
        {
          text: reason,
          callback_data: `auth:reason:${requestId}:${userId}:${globalIndex}`,
        },
      ];
    });

    // Add "سایر" (Other) button only on the last page
    if (currentPage === totalPages - 1) {
      buttons.push([
        {
          text: "📝 سایر",
          callback_data: `auth:custom:${requestId}:${userId}`,
        },
      ]);
    }

    // Add navigation row if needed
    const navigationRow: any[] = [];
    if (totalPages > 1) {
      if (currentPage > 0) {
        navigationRow.push({
          text: "⬅️ قبلی",
          callback_data: `auth:page:${requestId}:${userId}:${currentPage - 1}`,
        });
      }
      if (currentPage < totalPages - 1) {
        navigationRow.push({
          text: "➡️ بعدی",
          callback_data: `auth:page:${requestId}:${userId}:${currentPage + 1}`,
        });
      }
    }

    if (navigationRow.length > 0) {
      buttons.push(navigationRow);
    }

    return {
      inline_keyboard: buttons,
    };
  }

  // ---------- Callback query handler ----------
  private async handleCallbackQuery(ctx: Context): Promise<void> {
    try {
      const chatId = ctx.chat?.id;
      if (!chatId) return;

      const session = await authService.getAdminSession(chatId.toString());
      if (!session) {
        await ctx.answerCbQuery("ابتدا با /start احراز هویت کنید");
        return;
      }

      const cq: any = (ctx as any).callbackQuery;
      const data: string | undefined = cq && "data" in cq ? cq.data : undefined;
      if (!data) {
        await ctx.answerCbQuery();
        return;
      }

      // Handle custom reason selection
      if (data.startsWith("auth:custom:")) {
        // format: auth:custom:<requestId>:<userId>
        const [, , requestId, userId] = data.split(":");

        if (!requestId || !userId) {
          await ctx.answerCbQuery("داده نامعتبر است");
          return;
        }

        // Check if this requestId has already been processed
        const existingDecision = await authDecisionService.getDecision(
          requestId
        );
        if (existingDecision) {
          await ctx.answerCbQuery("این درخواست قبلاً پردازش شده است");
          return;
        }

        // Store pending action for custom reason
        await pendingAuthActionService.set(chatId.toString(), {
          kind: "auth_custom_reason",
          requestId,
          userId,
          status: "registering",
        });

        // Remove buttons and ask for custom reason
        try {
          await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
        } catch {}

        await ctx.answerCbQuery("لطفاً دلیل را وارد کنید");
        await ctx.reply(
          `📝 <b>دلیل سفارشی</b>\n\n` +
            `👤 شناسه کاربر: <code>${userId}</code>\n\n` +
            `لطفاً دلیل رد درخواست را وارد کنید:\n` +
            `⚠️ <i>حداکثر ۳ کلمه</i>`,
          { parse_mode: "HTML" }
        );
        return;
      }

      // Handle pagination for rejection reasons
      if (data.startsWith("auth:page:")) {
        // format: auth:page:<requestId>:<userId>:<pageNumber>
        const [, , requestId, userId, pageStr] = data.split(":");
        const page = parseInt(pageStr, 10);

        if (!requestId || !userId || isNaN(page) || page < 0) {
          await ctx.answerCbQuery("داده نامعتبر است");
          return;
        }

        // Check if this requestId has already been processed
        const existingDecision = await authDecisionService.getDecision(
          requestId
        );
        if (existingDecision) {
          await ctx.answerCbQuery("این درخواست قبلاً پردازش شده است");
          return;
        }

        // Update the keyboard with the new page
        try {
          await ctx.editMessageReplyMarkup(
            this.buildRejectionReasonKeyboard(requestId, userId, page)
          );
          await ctx.answerCbQuery();
        } catch (error) {
          await ctx.answerCbQuery("خطا در تغییر صفحه");
        }
        return;
      }

      // Handle rejection reason selection
      if (data.startsWith("auth:reason:")) {
        // format: auth:reason:<requestId>:<userId>:<reasonIndex>
        const [, , requestId, userId, reasonIndexStr] = data.split(":");
        const reasonIndex = parseInt(reasonIndexStr, 10);

        if (
          !requestId ||
          !userId ||
          isNaN(reasonIndex) ||
          reasonIndex < 0 ||
          reasonIndex >= this.REJECTION_REASONS.length
        ) {
          await ctx.answerCbQuery("داده نامعتبر است");
          return;
        }

        const reason = this.REJECTION_REASONS[reasonIndex];

        // Check if this requestId has already been processed
        const existingDecision = await authDecisionService.getDecision(
          requestId
        );
        if (existingDecision) {
          await ctx.answerCbQuery("این درخواست قبلاً پردازش شده است");
          return;
        }

        // Update status in main app with reason
        const success = await authStatusService.updateAuthStatus(
          userId,
          "registering",
          reason
        );

        if (success) {
          // Mark as processed
          await authDecisionService.setDecision(
            requestId,
            userId,
            "registering",
            session.phoneNumber
          );

          // Clear pending action
          await pendingAuthActionService.clear(chatId.toString());

          // Remove buttons from message
          try {
            await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
          } catch {}

          await ctx.answerCbQuery("رد شد");
          await ctx.reply(
            `❌ <b>درخواست رد شد</b>\n\n` +
              `👤 شناسه کاربر: <code>${userId}</code>\n` +
              `📌 وضعیت: <b>رد شده</b>\n` +
              `📝 دلیل: <b>${reason}</b>`,
            { parse_mode: "HTML" }
          );
        } else {
          await ctx.answerCbQuery("خطا در به‌روزرسانی وضعیت");
          await ctx.reply(
            `❌ به‌روزرسانی وضعیت ناموفق بود. لطفاً دوباره تلاش کنید.`
          );
        }
        return;
      }

      // Handle auth status callbacks
      if (data.startsWith("auth:")) {
        // format: auth:<status>:<requestId>:<userId>
        const [, statusRaw, requestId, userId] = data.split(":");

        if (!statusRaw || !requestId || !userId) {
          await ctx.answerCbQuery("داده نامعتبر است");
          return;
        }

        // Check if this requestId has already been processed by another admin
        const existingDecision = await authDecisionService.getDecision(
          requestId
        );
        if (existingDecision) {
          const existingEmoji =
            existingDecision.status === "verified" ? "✅" : "❌";
          const existingText =
            existingDecision.status === "verified" ? "تایید شده" : "رد شده";

          try {
            await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
          } catch {}

          await ctx.answerCbQuery("این درخواست قبلاً پردازش شده است");
          await ctx.reply(
            `${existingEmoji} این درخواست قبلاً ${existingText} است.\n` +
              `👤 شناسه کاربر: <code>${existingDecision.userId}</code>\n` +
              `🆔 شناسه درخواست: <code>${existingDecision.requestId}</code>\n` +
              `📞 پردازش توسط: <code>${existingDecision.processedBy}</code>\n` +
              `🕒 زمان: <code>${existingDecision.processedAt}</code>`,
            { parse_mode: "HTML" }
          );
          return;
        }

        // Handle verified (approve) - proceed immediately
        if (statusRaw === "verified") {
          const success = await authStatusService.updateAuthStatus(
            userId,
            "verified"
          );

          if (success) {
            // Mark as processed
            await authDecisionService.setDecision(
              requestId,
              userId,
              "verified",
              session.phoneNumber
            );

            // Remove buttons from message
            try {
              await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
            } catch {}

            await ctx.answerCbQuery("تایید شد");
            await ctx.reply(
              `✅ <b>وضعیت به‌روزرسانی شد</b>\n\n` +
                `👤 شناسه کاربر: <code>${userId}</code>\n` +
                `📌 وضعیت: <b>تایید شد</b>`,
              { parse_mode: "HTML" }
            );
          } else {
            await ctx.answerCbQuery("خطا در به‌روزرسانی وضعیت");
            await ctx.reply(
              `❌ به‌روزرسانی وضعیت ناموفق بود. لطفاً دوباره تلاش کنید.`
            );
          }
          return;
        }

        // Handle reject - show reason selection
        if (statusRaw === "reject") {
          // Store pending action
          await pendingAuthActionService.set(chatId.toString(), {
            kind: "auth_reject",
            requestId,
            userId,
            status: "registering",
          });

          // Remove original buttons and show reason selection
          try {
            await ctx.editMessageReplyMarkup({
              inline_keyboard: [],
            });
          } catch {}

          await ctx.answerCbQuery("لطفاً دلیل رد را انتخاب کنید");
          await ctx.reply(
            `❌ <b>رد درخواست</b>\n\n` +
              `👤 شناسه کاربر: <code>${userId}</code>\n\n` +
              `لطفاً دلیل رد درخواست را انتخاب کنید:`,
            {
              parse_mode: "HTML",
              reply_markup: this.buildRejectionReasonKeyboard(
                requestId,
                userId,
                0
              ),
            }
          );
          return;
        }

        await ctx.answerCbQuery("وضعیت نامعتبر است");
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

  // ---------- Helper: Download file from URL ----------
  private async downloadFile(url: string): Promise<Buffer | null> {
    try {
      const response = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: 60000, // 60 second timeout for large files
        maxContentLength: 50 * 1024 * 1024, // 50MB max
      });
      return Buffer.from(response.data);
    } catch (error) {
      console.error(`❌ Failed to download file from ${url}:`, error);
      return null;
    }
  }

  // ---------- Helper: Extract filename from URL ----------
  private getFileNameFromUrl(url: string, fallback: string): string {
    try {
      const parsed = new URL(url);
      const parts = parsed.pathname.split("/").filter(Boolean);
      const lastSegment = parts[parts.length - 1];
      if (!lastSegment) return fallback;

      const decoded = decodeURIComponent(lastSegment);
      // If no extension, use fallback
      if (!decoded.includes(".")) return fallback;
      return decoded;
    } catch {
      return fallback;
    }
  }

  // ---------- Helper: Generate unique request ID ----------
  // Generate short requestId to fit Telegram's 64-byte callback_data limit
  private generateRequestId(): string {
    // Format: timestamp (base36, ~8 chars) + random (base36, 6 chars) = ~14 chars
    // This keeps callback_data well under 64 bytes even with userId
    return `${Date.now().toString(36)}${Math.random()
      .toString(36)
      .slice(2, 8)}`;
  }

  // ---------- Send auth files to admins ----------
  public async sendAuthFilesToAllAdmins(
    userId: string,
    userInfo: {
      name: string;
      serialNumber?: string;
      birthDate: string;
      nationalCode: string;
    },
    videoUrl?: string,
    identityDocumentUrl?: string
  ): Promise<number> {
    try {
      const activeSessions = await authService.getActiveAdminSessions();
      console.log(`🔍 Found ${activeSessions.length} active admin sessions`);

      if (activeSessions.length === 0) {
        console.warn(
          "⚠️ No active admin sessions found - auth files cannot be sent"
        );
        return 0;
      }

      let sentCount = 0;

      // Generate unique requestId for this auth request (short format for Telegram limits)
      const requestId = this.generateRequestId();
      console.log(`🆔 Generated requestId: ${requestId} for userId: ${userId}`);

      // Download files from URLs (only once, reuse for all admins)
      console.log("📥 Downloading files from URLs...");
      const [videoBuffer, identityDocumentBuffer] = await Promise.all([
        videoUrl ? this.downloadFile(videoUrl) : Promise.resolve(null),
        identityDocumentUrl
          ? this.downloadFile(identityDocumentUrl)
          : Promise.resolve(null),
      ]);

      // Build message with user info
      const userInfoText = [
        `🔐 <b>درخواست احراز هویت جدید</b>\n\n`,
        `👤 <b>اطلاعات کاربر:</b>\n`,
        `• نام: ${userInfo.name}\n`,
        userInfo.serialNumber
          ? `• شماره سریال: ${userInfo.serialNumber}\n`
          : "",
        `• تاریخ تولد: ${userInfo.birthDate}\n`,
        `• کد ملی: <code>${userInfo.nationalCode}</code>\n`,
        `• شناسه کاربر: <code>${userId}</code>\n\n`,
        `📎 <b>فایل‌های ارسالی:</b>\n`,
        videoBuffer ? `✅ ویدیو کاربر\n` : "❌ ویدیو کاربر\n",
        identityDocumentBuffer ? `✅ مدرک هویتی\n` : "❌ مدرک هویتی\n",
      ]
        .filter(Boolean)
        .join("");

      for (const session of activeSessions) {
        try {
          console.log(
            `📤 Sending auth files to admin ${session.phoneNumber} (chatId: ${session.chatId})`
          );

          // Send message with user info and action buttons
          await this.bot.telegram.sendMessage(session.chatId, userInfoText, {
            parse_mode: "HTML",
            reply_markup: this.buildAuthInlineKeyboard(userId, requestId),
          });

          // Send video if available
          if (videoBuffer) {
            try {
              await this.bot.telegram.sendVideo(
                session.chatId,
                {
                  source: videoBuffer,
                  filename: this.getFileNameFromUrl(
                    videoUrl as string,
                    `${userId}-video.mp4`
                  ),
                },
                {
                  caption: `👤 شناسه کاربر: <code>${userId}</code>`,
                  parse_mode: "HTML",
                }
              );
            } catch (error) {
              console.error(
                `❌ Failed to send video to admin ${session.phoneNumber}:`,
                error
              );
            }
          }

          // Send identity document if available
          if (identityDocumentBuffer) {
            try {
              await this.bot.telegram.sendDocument(
                session.chatId,
                {
                  source: identityDocumentBuffer,
                  filename: this.getFileNameFromUrl(
                    identityDocumentUrl as string,
                    `${userId}-identity-doc`
                  ),
                },
                {
                  caption: `👤 شناسه کاربر: <code>${userId}</code>`,
                  parse_mode: "HTML",
                }
              );
            } catch (error) {
              console.error(
                `❌ Failed to send identity document to admin ${session.phoneNumber}:`,
                error
              );
            }
          }

          sentCount++;
          console.log(`✅ Successfully sent to admin ${session.phoneNumber}`);
        } catch (error) {
          console.error(
            `❌ Failed to send auth files to admin ${session.phoneNumber}:`,
            error
          );
        }
      }

      console.log(
        `📊 Total sent: ${sentCount}/${activeSessions.length} notifications`
      );
      return sentCount;
    } catch (error) {
      console.error("❌ Error sending auth files to all admins:", error);
      throw error;
    }
  }

  // ---------- Lifecycle ----------
  public async start(): Promise<void> {
    try {
      const botCommands = [
        { command: "start", description: "شروع ربات و احراز هویت ادمین" },
        { command: "logout", description: "خروج از ربات" },
        { command: "help", description: "راهنما" },
      ];

      await this.bot.telegram.setMyCommands(botCommands);
      await this.bot.launch();
      console.log("✅ Auth Bot launched successfully");
    } catch (error) {
      console.error("❌ Failed to start Auth bot:", error);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    try {
      await this.bot.stop("SIGTERM");
    } catch (error) {
      console.error("Error stopping Auth Bot:", error);
    }
  }
}

export const authBot = new AuthBot();
