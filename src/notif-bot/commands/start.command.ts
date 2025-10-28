import { Context } from "telegraf";
import { adminAuthService } from "../../support-bot/services/admin-auth.service";

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
      const existingSession = await adminAuthService.getAdminSession(
        chatId.toString()
      );

      if (existingSession) {
        await ctx.reply(
          `✅ خوش آمدید! شما قبلاً به عنوان ادمین احراز هویت شده‌اید.\n\n`
        );
        return;
      }

      // Send welcome message with phone number request
      await ctx.reply(`🤖 به ربات ارسال اعلان اسکناس خوش آمدید!\n\n`, {
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
      });
    } catch (error) {
      await ctx.reply("❌ خطایی رخ داد. لطفاً بعداً دوباره تلاش کنید.");
    }
  },
};
