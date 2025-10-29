import { Context } from "telegraf";
import { adminAuthService } from "../../support-bot/services/admin-auth.service";
import { KeyboardButton } from "telegraf/typings/core/types/typegram";

export const startCommand = {
  command: "start",
  description: "Start the bot and verify admin access",
  handler: async (ctx: Context): Promise<void> => {
    try {
      const chatId = ctx.chat?.id;
      if (!chatId) {
        await ctx.reply("❌ قادر به شناسایی چت نیستیم. لطفاً دوباره تلاش کن.");
        return;
      }

      // Check if user already has an active session
      const existingSession = await adminAuthService.getAdminSession(
        chatId.toString()
      );

      if (existingSession) {
        await ctx.reply(
          `✅ خوش اومدی! شما قبلاً به عنوان ادمین احراز هویت شدی.\n\n`
        );
        // Menu will be shown by bot after /start to avoid duplication
        return;
      }

      // Send welcome message with phone number request
      await ctx.reply(`🤖 به ربات ارسال نوتیفیکیشن اسکناس خوش اومدی!\n\n`, {
        reply_markup: {
          keyboard: [
            [{ text: "📱 اشتراک‌گذاری شماره تلفن", request_contact: true }],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
          selective: true,
          input_field_placeholder:
            "از دکمه زیر برای اشتراک‌ گذاری شماره تلفن استفاده کن.",
        },
      });
    } catch (error) {
      await ctx.reply("❌ خطایی رخ داد. لطفاً بعداً دوباره تلاش کن.");
    }
  },
};
