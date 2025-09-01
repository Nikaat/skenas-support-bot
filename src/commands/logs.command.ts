import { Context } from "telegraf";
import { adminAuthService } from "../services/admin-auth.service";

export const logsCommand = {
  command: "logs",
  description: "View failed transaction logs",
  handler: async (ctx: Context): Promise<void> => {
    try {
      const chatId = ctx.chat?.id;
      if (!chatId) {
        await ctx.reply(
          "❌ قادر به شناسایی چت نیستیم. لطفاً دوباره تلاش کنید."
        );
        return;
      }

      // Check if user is authenticated as admin
      const session = adminAuthService.getAdminSession(chatId.toString());
      if (!session) {
        await ctx.reply(
          "❌ شما به عنوان ادمین احراز هویت نشده‌اید.\n\n" +
            "لطفاً از /start برای شروع فرآیند احراز هویت استفاده کنید."
        );
        return;
      }

      // Show loading message
      const loadingMsg = await ctx.reply(
        "⏳ در حال دریافت لاگ‌های تراکنش‌های ناموفق و درحال بررسی..."
      );

      try {
        // For now, show a simple message since we're not storing failed transactions locally yet
        await ctx.telegram.editMessageText(
          chatId,
          loadingMsg.message_id,
          undefined,
          "ربات در حال حاضر هشدارهای لحظه‌ای تراکنش‌های ناموفق و درحال بررسی را دریافت و ارسال می‌کند.\n\n" +
            "💡 برای مشاهده لاگ‌ها، منتظر هشدارهای جدید باشید."
        );
      } catch (error) {
        await ctx.telegram.editMessageText(
          chatId,
          loadingMsg.message_id,
          undefined,
          "❌ خطایی در نمایش لاگ‌ها رخ داد.\n\n" +
            "لطفاً بعداً دوباره تلاش کنید."
        );
      }
    } catch (error) {
      await ctx.reply(
        "❌ خطایی در حین دریافت لاگ‌ها رخ داد. لطفاً بعداً دوباره تلاش کنید."
      );
    }
  },
};
