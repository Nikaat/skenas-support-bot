import { Context } from "telegraf";

export const logoutCommand = async (ctx: Context): Promise<void> => {
  try {
    const userId = ctx.from?.id;

    if (!userId) {
      await ctx.reply("❌ Unable to identify user. Please try again.");
      return;
    }

    // The bot will handle unsubscription logic

    await ctx.reply(
      "👋 <b>You have been unsubscribed</b>\n\n" +
        "❌ You will no longer receive market updates.\n\n" +
        "💡 Use /start to subscribe again if you change your mind.",
      { parse_mode: "HTML" }
    );

    console.log(`❌ User ${userId} unsubscribed from markets bot`);
  } catch (error) {
    console.error("Error in logout command:", error);
    await ctx.reply("❌ An error occurred. Please try again later.");
  }
};
