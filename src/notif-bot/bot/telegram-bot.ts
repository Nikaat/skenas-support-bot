import { Telegraf, Context } from "telegraf";
import type { Message } from "telegraf/typings/core/types/typegram";
import { config } from "../../utils/config";
import { startCommand as startCmd } from "../commands/start.command";
import { adminAuthService } from "../../support-bot/services/admin-auth.service";
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
  };
}

export class TelegramNotifBot {
  private bot: Telegraf<Context>;

  constructor() {
    this.bot = new Telegraf(config.telegram.notifBotToken);
    this.setupCommands();
  }

  // ---------- Helpers ----------
  private async requireAdmin(ctx: Context): Promise<{
    phoneNumber: string;
    chatId: string;
    lastActivity: Date;
  } | null> {
    const chatId = ctx.chat?.id;
    if (!chatId) return null;
    const session = await adminAuthService.getAdminSession(chatId.toString());
    if (!session) {
      await ctx.reply(
        "❌ شما به عنوان ادمین احراز هویت نشده‌اید. از /start استفاده کن."
      );
      return null;
    }
    return session as any;
  }

  private askChoice(
    ctx: Context,
    field: "url" | "tag" | "image"
  ): Promise<Message.TextMessage | Message> {
    const askText =
      field === "url"
        ? "🔗 لینکی که یوزر به اون میره رو داری؟ "
        : field === "tag"
        ? "🏷️ آیدی تگ نوتیفیکیشن رو داری؟"
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
    field: "url" | "tag" | "image"
  ): Promise<Message.TextMessage | Message> {
    const prompt =
      field === "url"
        ? "🔗 لینک رو وارد کن:"
        : field === "tag"
        ? "🏷️ تگ رو وارد کن:"
        : "🖼️ لینک عکس رو وارد کن:";
    return ctx.reply(prompt);
  }

  private nextField(current: "url" | "tag" | "image"): "tag" | "image" | null {
    if (current === "url") return "tag";
    if (current === "tag") return "image";
    return null;
  }

  private buildPayload(data: Partial<INotificationData>): INotificationData {
    return {
      title: data.title!,
      body: data.body!,
      url: data.url || "/",
      tag: data.tag || "",
      image: data.image || "",
    };
  }

  private setupCommands(): void {
    this.bot.command(startCmd.command, async (ctx) => {
      await startCmd.handler(ctx);
      // if the admin is already authenticated, show menu immediately
      const chatId = ctx.chat?.id;
      if (!chatId) return;
      const session = await adminAuthService.getAdminSession(chatId.toString());
      if (session) {
        await ctx.reply("🧭 منوی نوتیفیکیشن:", { reply_markup: mainMenu() });
      }
    });

    // Text handler for menu and conversation steps
    this.bot.on("text", this.handleText.bind(this));

    // Inline buttons handler for optional fields
    this.bot.on("callback_query", this.handleCallback.bind(this));
  }

  private async handleText(
    ctx: Context & { message: Message.TextMessage }
  ): Promise<void> {
    const text = ctx.message.text?.trim();
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    // Ignore slash commands
    if (text.startsWith("/")) return;

    // Ensure admin
    const session = await this.requireAdmin(ctx);
    if (!session) return;

    // Cancel flow
    if (text === MENU_CANCEL) {
      await pendingNotifService.clear(chatId.toString());
      await ctx.reply("🚫 عملیات لغو شد.", { reply_markup: mainMenu() });
      return;
    }

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
          "👤 شناسه کاربر(شماره تلفن) رو وارد کن (مثال: +98123456789)"
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
        // Validate E.164-ish: leading + and digits
        if (!/^\+98\d{10}$/.test(text)) {
          await ctx.reply("⚠️ قالب شماره تلفن نامعتبر است. مثال: +98123456789");
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
        pending.step = "await_tag_choice";
        await pendingNotifService.set(chatId.toString(), pending);
        await this.askChoice(ctx, "tag");
        return;
      }

      if (pending.step === "await_tag") {
        if (text !== "-") pending.data.tag = text;
        pending.step = "await_image_choice";
        await pendingNotifService.set(chatId.toString(), pending);
        await this.askChoice(ctx, "image");
        return;
      }

      if (pending.step === "await_image") {
        if (text !== "-") pending.data.image = text;

        const payload: INotificationData = this.buildPayload(pending.data);

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
        pending.step = "await_tag_choice";
        await pendingNotifService.set(chatId.toString(), pending);
        await this.askChoice(ctx, "tag");
        return;
      }
      if (pending.step === "await_tag") {
        if (text !== "-") pending.data.tag = text;
        pending.step = "await_image_choice";
        await pendingNotifService.set(chatId.toString(), pending);
        await this.askChoice(ctx, "image");
        return;
      }

      if (pending.step === "await_image") {
        if (text !== "-") pending.data.image = text;
        const payload: INotificationData = this.buildPayload(pending.data);
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
        await ctx.answerCbQuery();
      } catch {}
      return;
    }

    // Ensure admin session
    const session = await adminAuthService.getAdminSession(chatId.toString());
    if (!session) {
      await ctx.answerCbQuery("اول با /start احراز هویت کن");
      return;
    }

    const pending = await pendingNotifService.get(chatId.toString());
    if (!pending) {
      await ctx.answerCbQuery();
      return;
    }

    // opt:<field>:yes|no
    if (!data.startsWith("opt:")) {
      await ctx.answerCbQuery();
      return;
    }

    const [, field, choice] = data.split(":");
    const yes = choice === "yes";

    // Clean buttons on message
    try {
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    } catch {}

    const askTagChoice = async () => {
      await this.askChoice(ctx, "tag");
    };
    const askImageChoice = async () => {
      await this.askChoice(ctx, "image");
    };

    if (field === "url") {
      if (yes) {
        pending.step = "await_url" as any;
        await pendingNotifService.set(chatId.toString(), pending);
        await this.askValuePrompt(ctx, "url");
      } else {
        pending.data.url = "/";
        pending.step = "await_tag_choice" as any;
        await pendingNotifService.set(chatId.toString(), pending);
        await askTagChoice();
      }
      await ctx.answerCbQuery();
      return;
    }

    if (field === "tag") {
      if (yes) {
        pending.step = "await_tag" as any;
        await pendingNotifService.set(chatId.toString(), pending);
        await this.askValuePrompt(ctx, "tag");
      } else {
        pending.data.tag = "";
        pending.step = "await_image_choice" as any;
        await pendingNotifService.set(chatId.toString(), pending);
        await askImageChoice();
      }
      await ctx.answerCbQuery();
      return;
    }

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
      await ctx.answerCbQuery();
      return;
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
        tag: pending.data.tag || "",
        image: pending.data.image || "",
      };
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
        tag: pending.data.tag || "",
        image: pending.data.image || "",
      };
      const ok = await notifService.broadcastNotification(payload);
      await pendingNotifService.clear(chatId.toString());
      await ctx.reply(
        ok
          ? "✅ نوتیفیکیشن برای همه یوزرها ارسال شد."
          : "❌ ارسال نوتیفیکیشن برای همه یوزرها ناموفق بود.",
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
