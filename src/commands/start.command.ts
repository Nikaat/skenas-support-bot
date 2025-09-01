import { Context } from "telegraf";
import { adminAuthService } from "../services/admin-auth.service";

export const startCommand = {
  command: "start",
  description: "Start the bot and verify admin access",
  handler: async (ctx: Context): Promise<void> => {
    try {
      const chatId = ctx.chat?.id;
      if (!chatId) {
        await ctx.reply(
          "❌ قادر به شناسایی چت نیستیم. لطفاً دوباره تلاش کنید."
        );
        return;
      }

      // Check if user already has an active session
      const existingSession = adminAuthService.getAdminSession(
        chatId.toString()
      );

      if (existingSession) {
        await ctx.reply(
          `✅ خوش آمدید! شما قبلاً به عنوان ادمین احراز هویت شده‌اید.\n\n` +
            `از /logs برای مشاهده لاگ‌های تراکنش‌های ناموفق و درحال بررسی استفاده کنید.\n` +
            `از /logout برای پایان دادن به جلسه استفاده کنید.`
        );
        return;
      }

      // Send welcome message with phone number request
      await ctx.reply(
        `🤖 به ربات پشتیبانی اسکناس خوش آمدید!\n\n` +
          `این ربات هشدارهای تراکنش‌های ناموفق را از برنامه اصلی دریافت کرده و به ادمین‌ها ارسال می‌کند.\n\n` +
          `برای ادامه، لطفاً شماره تلفن خود را با کلیک روی دکمه زیر به اشتراک بگذارید:`,
        {
          reply_markup: {
            keyboard: [
              [{ text: "📱 اشتراک‌گذاری شماره تلفن", request_contact: true }],
            ],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        }
      );
    } catch (error) {
      await ctx.reply("❌ خطایی رخ داد. لطفاً بعداً دوباره تلاش کنید.");
    }
  },
};
