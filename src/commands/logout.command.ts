import { Context } from "telegraf";
import { adminAuthService } from "../services/admin-auth.service";

export const logoutCommand = {
  command: "logout",
  description: "Logout and end admin session",
  handler: async (ctx: Context): Promise<void> => {
    try {
      const chatId = ctx.chat?.id;
      if (!chatId) {
        await ctx.reply("❌ Unable to identify chat. Please try again.");
        return;
      }

      // Remove admin session
      const removed = adminAuthService.removeAdminSession(chatId.toString());

      if (removed) {
        await ctx.reply(
          "✅ Successfully logged out!\n\n" +
            "Your admin session has been ended.\n" +
            "Use /start to authenticate again if needed."
        );
      } else {
        await ctx.reply(
          "ℹ️ No active session found.\n\n" + "You are already logged out."
        );
      }
    } catch (error) {
      await ctx.reply(
        "❌ An error occurred during logout. Please try again later."
      );
    }
  },
};
