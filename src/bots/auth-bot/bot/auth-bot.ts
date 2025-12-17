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
            callback_data: `auth:registering:${requestId}:${userId}`,
          },
        ],
      ],
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

      // Handle auth status callbacks
      if (data.startsWith("auth:")) {
        // format: auth:<status>:<requestId>:<userId>
        const [, statusRaw, requestId, userId] = data.split(":");

        if (!statusRaw || !requestId || !userId) {
          await ctx.answerCbQuery("داده نامعتبر است");
          return;
        }

        if (statusRaw !== "verified" && statusRaw !== "registering") {
          await ctx.answerCbQuery("وضعیت نامعتبر است");
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

        // Update status in main app
        const success = await authStatusService.updateAuthStatus(
          userId,
          statusRaw as "verified" | "registering"
        );

        if (success) {
          // Mark as processed so other admins can't change it
          await authDecisionService.setDecision(
            requestId,
            userId,
            statusRaw as "verified" | "registering",
            session.phoneNumber
          );
          // Remove buttons from message
          try {
            await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
          } catch {}

          const statusText = statusRaw === "verified" ? "تایید شد" : "رد شد";
          const statusEmoji = statusRaw === "verified" ? "✅" : "❌";

          await ctx.answerCbQuery(`${statusEmoji} ${statusText}`);
          await ctx.reply(
            `${statusEmoji} <b>وضعیت به‌روزرسانی شد</b>\n\n` +
              `👤 شناسه کاربر: <code>${userId}</code>\n` +
              `📌 وضعیت: <b>${statusText}</b>`,
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
  private generateRequestId(userId: string): string {
    return `auth-${userId}-${Date.now().toString(36)}-${Math.random()
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

      // Generate unique requestId for this auth request
      const requestId = this.generateRequestId(userId);
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
