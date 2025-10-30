import { Telegraf, Context, Markup } from "telegraf";
import type { Message } from "telegraf/typings/core/types/typegram";
import { config } from "../../utils/config";
import { startCommand as startCmd } from "../commands/start.command";
import { notifAdminAuthService } from "../services/admin-auth.service";
import { pendingNotifService } from "../services/pending-notif.service";
import { notifService } from "../services/notif.service";
import { INotificationData } from "../../enums/support-bot-enums";

const MENU_SEND_ONE = "ارسال نوتیفیکیشن به یک یوزر 👤";
const MENU_BROADCAST = "ارسال نوتیفیکیشن به همه یوزرها 📢";
const MENU_CANCEL = "لغو عملیات 🚫";

function mainMenu() {
  return {
    keyboard: [
      [{ text: MENU_SEND_ONE }, { text: MENU_BROADCAST }],
      [{ text: MENU_CANCEL }],
    ],
    resize_keyboard: true,
    one_time_keyboard: false,
  }; // بدون as const
}

function phoneRequestKeyboard() {
  return {
    keyboard: [
      [{ text: "اشتراک‌گذاری شماره تلفن ☎️", request_contact: true }],
      [{ text: MENU_CANCEL }],
    ],
    resize_keyboard: true,
    one_time_keyboard: true,
  }; // بدون as const
}

function normalizePhone(raw: string): string {
  // Keep digits and leading plus
  let p = raw.replace(/[^\d+]/g, "");
  if (p.startsWith("+")) return p;
  if (p.startsWith("00")) return "+" + p.slice(2);
  if (p.startsWith("98")) return "+" + p;
  if (p.startsWith("0")) return "+98" + p.slice(1);
  return "+" + p; // last-resort normalization
}

export class TelegramNotifBot {
  private bot: Telegraf<Context>;

  constructor() {
    this.bot = new Telegraf(config.telegram.notifBotToken);
    this.setupCommands();
  }

  // ---------- Helpers ----------
  private generateRandomTag(): string {
    const chars =
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let out = "";
    for (let i = 0; i < 10; i++)
      out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }
  private async requireAdmin(ctx: Context): Promise<{
    phoneNumber: string;
    chatId: string;
    lastActivity: Date;
  } | null> {
    const chatId = ctx.chat?.id;
    if (!chatId) return null;

    const session = await notifAdminAuthService.getAdminSession(
      chatId.toString()
    );

    if (!session) {
      await ctx.reply(
        "❌ شما به عنوان ادمین احراز هویت نشده‌اید. از /start استفاده کن یا شماره تلفنت رو با دکمه زیر بفرست.",
        { reply_markup: phoneRequestKeyboard() }
      );
      return null;
    }
    return session as any;
  }

  private askChoice(
    ctx: Context,
    field: "url" | "image"
  ): Promise<Message.TextMessage | Message> {
    const askText =
      field === "url"
        ? "🔗 لینکی که یوزر به اون میره رو داری؟ "
        : "🖼️ لینک عکسی که به یوزر نشون داده میشه رو داری؟";

    return ctx.reply(askText, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "بله", callback_data: `opt:${field}:yes` },
            { text: "خیر", callback_data: `opt:${field}:no` },
          ],
        ],
      },
    });
  }

  private askValuePrompt(
    ctx: Context,
    field: "url" | "image"
  ): Promise<Message.TextMessage | Message> {
    const prompt =
      field === "url" ? "🔗 لینک رو وارد کن:" : "🖼️ لینک عکس رو وارد کن:";
    return ctx.reply(prompt);
  }

  private buildPayload(data: Partial<INotificationData>): INotificationData {
    return {
      title: data.title!,
      body: data.body!,
      url: data.url || "/",
      tag: this.generateRandomTag(),
      image: data.image || "",
    };
  }

  private setupCommands(): void {
    // /start command
    this.bot.command(startCmd.command, async (ctx) => {
      await startCmd.handler(ctx);

      const chatId = ctx.chat?.id;
      if (!chatId) return;

      const session = await notifAdminAuthService.getAdminSession(
        chatId.toString()
      );

      if (session) {
        await ctx.reply("🧭 منوی نوتیفیکیشن:", { reply_markup: mainMenu() });
      } else {
        await ctx.reply(
          "برای ادامه، شماره تلفن خود را با دکمه زیر ارسال کن تا دسترسی ادمین بررسی شود.",
          { reply_markup: phoneRequestKeyboard() }
        );
      }
    });

    // Text handler for menu and conversation steps
    this.bot.on("text", this.handleText.bind(this));

    // Inline buttons handler for optional fields
    this.bot.on("callback_query", this.handleCallback.bind(this));

    // Contact handler for admin registration
    this.bot.on("contact", this.handleContact.bind(this));
  }

  private async handleText(
    ctx: Context & { message: Message.TextMessage }
  ): Promise<void> {
    const text = ctx.message.text?.trim();
    const chatId = ctx.chat?.id;
    if (!chatId || !text) return;

    // Ignore slash commands
    if (text.startsWith("/")) return;

    // Cancel flow
    if (text === MENU_CANCEL) {
      await pendingNotifService.clear(chatId.toString());
      await ctx.reply("🚫 عملیات لغو شد.", { reply_markup: mainMenu() });
      return;
    }

    // Ensure admin
    const session = await this.requireAdmin(ctx);
    if (!session) return;

    // Check for menu tap when there is no pending flow
    const pending = await pendingNotifService.get(chatId.toString());
    if (!pending) {
      if (text === MENU_SEND_ONE) {
        await pendingNotifService.set(chatId.toString(), {
          kind: "notif_send_one",
          step: "await_user_id",
          data: {},
        });
        await ctx.reply(
          "👤 شناسه کاربر (شماره تلفن) را وارد کن (مثال: +989123456789)"
        );
        return;
      }
      if (text === MENU_BROADCAST) {
        await pendingNotifService.set(chatId.toString(), {
          kind: "notif_broadcast",
          step: "await_title",
          data: {},
        });
        await ctx.reply("📝 عنوان نوتیفیکیشن رو وارد کن:");
        return;
      }
      // Not a menu command; show menu hint
      await ctx.reply("💡 از منو یک گزینه رو انتخاب کن.", {
        reply_markup: mainMenu(),
      });
      return;
    }

    // Continue the flow
    if (pending.kind === "notif_send_one") {
      if (pending.step === "await_user_id") {
        // Validate Iranian E.164: +98 followed by 10 digits (e.g., +989xxxxxxxxx)
        if (!/^\+98\d{10}$/.test(text)) {
          await ctx.reply(
            "⚠️ قالب شماره تلفن نامعتبر است. مثال صحیح: +989123456789"
          );
          return;
        }
        pending.data.userId = text;
        pending.step = "await_title";
        await pendingNotifService.set(chatId.toString(), pending);
        await ctx.reply("📝 عنوان نوتیفیکیشن رو وارد کن:");
        return;
      }

      if (pending.step === "await_title") {
        pending.data.title = text;
        pending.step = "await_body";
        await pendingNotifService.set(chatId.toString(), pending);
        await ctx.reply("✉️ متن پیام رو وارد کن:");
        return;
      }

      if (pending.step === "await_body") {
        pending.data.body = text;
        pending.step = "await_url_choice";
        await pendingNotifService.set(chatId.toString(), pending);
        await this.askChoice(ctx, "url");
        return;
      }

      if (pending.step === "await_url") {
        if (text !== "-") pending.data.url = text;
        pending.data.tag = this.generateRandomTag();
        pending.step = "await_image_choice";
        await pendingNotifService.set(chatId.toString(), pending);
        await this.askChoice(ctx, "image");
        return;
      }

      // removed tag step; we always generate automatically

      if (pending.step === "await_image") {
        if (text !== "-") pending.data.image = text;

        const payload: INotificationData = this.buildPayload(pending.data);

        await ctx.reply("⏳ در حال ارسال نوتیفیکیشن...");

        const ok = await notifService.sendNotificationToUser(
          payload,
          pending.data.userId!
        );
        await pendingNotifService.clear(chatId.toString());

        if (ok) {
          await ctx.reply("✅👤 نوتیفیکیشن برای یوزر ارسال شد.", {
            reply_markup: mainMenu(),
          });
        } else {
          await ctx.reply("❌👤 ارسال نوتیفیکیشن برای یوزر ناموفق بود.", {
            reply_markup: mainMenu(),
          });
        }
        return;
      }
    }

    if (pending.kind === "notif_broadcast") {
      if (pending.step === "await_title") {
        pending.data.title = text;
        pending.step = "await_body";
        await pendingNotifService.set(chatId.toString(), pending);
        await ctx.reply("✉️ متن پیام رو وارد کن:");
        return;
      }
      if (pending.step === "await_body") {
        pending.data.body = text;
        pending.step = "await_url_choice";
        await pendingNotifService.set(chatId.toString(), pending);
        await this.askChoice(ctx, "url");
        return;
      }
      if (pending.step === "await_url") {
        if (text !== "-") pending.data.url = text;
        pending.data.tag = this.generateRandomTag();
        pending.step = "await_image_choice";
        await pendingNotifService.set(chatId.toString(), pending);
        await this.askChoice(ctx, "image");
        return;
      }
      // removed tag step; we always generate automatically

      if (pending.step === "await_image") {
        if (text !== "-") pending.data.image = text;
        const payload: INotificationData = this.buildPayload(pending.data);
        await ctx.reply("⏳ در حال ارسال نوتیفیکیشن...");
        const ok = await notifService.broadcastNotification(payload);
        await pendingNotifService.clear(chatId.toString());
        if (ok) {
          await ctx.reply("✅📣 نوتیفیکیشن برای همه یوزرها ارسال شد.", {
            reply_markup: mainMenu(),
          });
        } else {
          await ctx.reply("❌📣 ارسال نوتیفیکیشن برای همه یوزرها ناموفق بود.", {
            reply_markup: mainMenu(),
          });
        }
        return;
      }
    }
  }

  private async handleCallback(ctx: Context): Promise<void> {
    const cq: any = (ctx as any).callbackQuery;
    const data: string | undefined = cq && "data" in cq ? cq.data : undefined;
    const chatId = ctx.chat?.id;
    if (!chatId || !data) {
      try {
        await (ctx as any).answerCbQuery?.();
      } catch {}
      return;
    }

    // Ensure admin session
    const session = await notifAdminAuthService.getAdminSession(
      chatId.toString()
    );
    if (!session) {
      await (ctx as any).answerCbQuery?.("اول با /start احراز هویت کن");
      return;
    }

    const pending = await pendingNotifService.get(chatId.toString());
    if (!pending) {
      await (ctx as any).answerCbQuery?.();
      return;
    }

    // opt:<field>:yes|no
    if (!data.startsWith("opt:")) {
      await (ctx as any).answerCbQuery?.();
      return;
    }

    const [, field, choice] = data.split(":");
    const yes = choice === "yes";

    // Clean buttons on message
    try {
      await (ctx as any).editMessageReplyMarkup({ inline_keyboard: [] });
    } catch {}

    if (field === "url") {
      if (yes) {
        pending.step = "await_url" as any;
        await pendingNotifService.set(chatId.toString(), pending);
        await this.askValuePrompt(ctx, "url");
      } else {
        pending.data.url = "/";
        pending.data.tag = this.generateRandomTag();
        pending.step = "await_image_choice" as any;
        await pendingNotifService.set(chatId.toString(), pending);
        await this.askChoice(ctx, "image");
      }
      await (ctx as any).answerCbQuery?.();
      return;
    }

    // removed tag callback handling; tag is always auto-generated

    if (field === "image") {
      if (yes) {
        pending.step = "await_image" as any;
        await pendingNotifService.set(chatId.toString(), pending);
        await this.askValuePrompt(ctx, "image");
      } else {
        pending.data.image = "";
        // complete based on flow
        await this.finishIfComplete(ctx as any, pending);
      }
      await (ctx as any).answerCbQuery?.();
      return;
    }
  }

  private async handleContact(
    ctx: Context & { message: Message.ContactMessage }
  ): Promise<void> {
    try {
      const contact = ctx.message.contact;
      if (!contact || !contact.phone_number) {
        await ctx.reply(
          "❌ لطفاً از دکمه 'اشتراک‌گذاری شماره تلفن' استفاده کنید.\n\nشماره تلفن را به صورت دستی تایپ نکنید.",
          { reply_markup: phoneRequestKeyboard() }
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
      const isAdmin = await notifAdminAuthService.verifyAdminByPhone(
        phoneNumber
      );

      if (isAdmin) {
        // Create admin session
        await notifAdminAuthService.createAdminSession(
          phoneNumber,
          chatId.toString()
        );

        await ctx.reply(
          `✅ <b>دسترسی ادمین تأیید شد!</b>\n\n` +
            `خوش آمدید! شماره تلفن ${phoneNumber} شما به عنوان ادمین تأیید شده است.\n\n` +
            `اکنون می‌توانید از منوی زیر استفاده کنید یا دستورات زیر را ببینید:\n` +
            `• /start - نمایش منو\n` +
            `• /help - نمایش دستورات موجود`,
          { parse_mode: "HTML", reply_markup: mainMenu() as any }
        );
      } else {
        await ctx.reply(
          `❌ <b>دسترسی رد شد</b>\n\n` +
            `شماره تلفن ${phoneNumber} در لیست ادمین‌ها نیست.\n\n` +
            `لطفاً با مدیر سیستم تماس بگیرید تا به لیست ادمین‌ها اضافه شوید.`,
          { parse_mode: "HTML", reply_markup: phoneRequestKeyboard() as any }
        );
      }
    } catch (error) {
      await ctx.reply(
        "❌ خطایی در حین پردازش اطلاعات تماس شما رخ داد. لطفاً دوباره تلاش کنید."
      );
    }
  }

  private async finishIfComplete(
    ctx: Context & { message?: Message.TextMessage },
    pending: any
  ): Promise<void> {
    const chatId = ctx.chat?.id as number;
    if (
      pending.kind === "notif_send_one" &&
      (pending.step === "await_image" || pending.step === "await_image_choice")
    ) {
      // if choice was no, step is image_choice; proceed to send
      const payload: INotificationData = {
        title: pending.data.title!,
        body: pending.data.body!,
        url: pending.data.url || "/",
        tag: this.generateRandomTag() || "",
        image: pending.data.image || "",
      };
      await ctx.reply("⏳ در حال ارسال نوتیفیکیشن...");
      const ok = await notifService.sendNotificationToUser(
        payload,
        pending.data.userId!
      );
      await pendingNotifService.clear(chatId.toString());
      await ctx.reply(
        ok
          ? "✅ نوتیفیکیشن برای یوزر ارسال شد."
          : "❌ ارسال نوتیفیکیشن برای یوزر ناموفق بود.",
        { reply_markup: mainMenu() }
      );
      return;
    }

    if (
      pending.kind === "notif_broadcast" &&
      (pending.step === "await_image" || pending.step === "await_image_choice")
    ) {
      const payload: INotificationData = {
        title: pending.data.title!,
        body: pending.data.body!,
        url: pending.data.url || "/",
        tag: this.generateRandomTag() || "",
        image: pending.data.image || "",
      };
      await ctx.reply("⏳ در حال ارسال نوتیفیکیشن...");
      const ok = await notifService.broadcastNotification(payload);
      await pendingNotifService.clear(chatId.toString());
      await ctx.reply(
        ok
          ? "✅ نوتیفیکیشن برای همه یوزرها ارسال شد."
          : "❌ نوتیفیکیشن برای همه یوزرها ناموفق بود.",
        { reply_markup: mainMenu() }
      );
      return;
    }
  }

  public async start(): Promise<void> {
    await this.bot.telegram.setMyCommands([
      { command: "start", description: "شروع ربات و نمایش منو" },
    ]);
    await this.bot.launch();
    console.log("✅ Notif Bot launched successfully");
  }

  public async stop(): Promise<void> {
    try {
      await this.bot.stop("SIGTERM");
    } catch {}
  }
}

export const telegramNotifBot = new TelegramNotifBot();
