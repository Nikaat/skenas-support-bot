import { Context } from "telegraf";
import { adminAuthService } from "../services/admin-auth.service";

export const logoutCommand = {
  command: "logout",
  description: "Logout and end admin session",
  handler: async (ctx: Context): Promise<void> => {
    try {
      const chatId = ctx.chat?.id;
      if (!chatId) {
        await ctx.reply(
          "❌ قادر به شناسایی چت نیستیم. لطفاً دوباره تلاش کنید."
        );
        return;
      }

      // Remove admin session
      const removed = await adminAuthService.removeAdminSession(
        chatId.toString()
      );

      if (removed) {
        await ctx.reply(
          "✅ با موفقیت خارج شدید!\n\n" +
            "جلسه ادمین شما پایان یافته است.\n" +
            "در صورت نیاز از /start برای احراز هویت مجدد استفاده کنید."
        );
      } else {
        await ctx.reply(
          "ℹ️ هیچ جلسه فعالی یافت نشد.\n\n" + "شما قبلاً خارج شده‌اید."
        );
      }
    } catch (error) {
      await ctx.reply(
        "❌ خطایی در حین خروج رخ داد. لطفاً بعداً دوباره تلاش کنید."
      );
    }
  },
};
