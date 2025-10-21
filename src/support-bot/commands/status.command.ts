import { Context } from "telegraf";
import { adminAuthService } from "../services/admin-auth.service";

export const statusCommand = {
  command: "status",
  description: "Check bot and API connection status",
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
      const session = await adminAuthService.getAdminSession(chatId.toString());
      if (!session) {
        await ctx.reply(
          "❌ شما به عنوان ادمین احراز هویت نشده‌اید.\n\n" +
            "لطفاً از /start برای شروع فرآیند احراز هویت استفاده کنید."
        );
        return;
      }

      // Show loading message
      const loadingMsg = await ctx.reply("⏳ در حال بررسی وضعیت سیستم...");

      try {
        // Format status message
        const activeSessions = await adminAuthService.getActiveAdminSessions();
        const statusText = formatStatusMessage({
          activeSessions: activeSessions.length,
          botUptime: process.uptime(),
        });

        // Update loading message with status
        await ctx.telegram.editMessageText(
          chatId,
          loadingMsg.message_id,
          undefined,
          statusText,
          {
            parse_mode: "HTML",
          }
        );
      } catch (error) {
        await ctx.telegram.editMessageText(
          chatId,
          loadingMsg.message_id,
          undefined,
          "❌ بررسی وضعیت سیستم ناموفق بود.\n\n" +
            "لطفاً بعداً دوباره تلاش کنید."
        );
      }
    } catch (error) {
      await ctx.reply(
        "❌ خطایی در حین بررسی وضعیت رخ داد. لطفاً بعداً دوباره تلاش کنید."
      );
    }
  },
};

function formatStatusMessage(status: {
  activeSessions: number;
  botUptime: number;
}): string {
  const uptimeHours = Math.floor(status.botUptime / 3600);
  const uptimeMinutes = Math.floor((status.botUptime % 3600) / 60);

  let result = `📊 <b>وضعیت ربات هشدار تراکنش‌های ناموفق و درحال بررسی</b>\n\n`;

  // Active sessions
  result += `👥 <b>ادمین‌های فعال:</b> ${status.activeSessions}\n`;

  // Bot uptime
  result += `⏱️ <b>زمان کار ربات:</b> ${uptimeHours} ساعت ${uptimeMinutes} دقیقه\n`;

  // Overall status
  result += `\n📈 <b>وضعیت کلی:</b> 🟢 آماده دریافت هشدارها`;

  return result;
}
