import { Context } from "telegraf";

export const startCommand = async (ctx: Context): Promise<void> => {
  try {
    const userId = ctx.from?.id;

    if (!userId) {
      await ctx.reply("❌ Unable to identify user. Please try again.");
      return;
    }

    // For now, just show the welcome message
    // The bot will handle subscription logic

    await ctx.reply(
      "🎉 <b>Welcome to Markets Bot!</b>\n\n" +
        "✅ <b>You are now subscribed to market updates</b>\n\n" +
        "📊 <b>What you'll receive:</b>\n" +
        "• Currency market data (Top 5)\n" +
        "• Cryptocurrency data (Top 5)\n" +
        "• Gold market data (Top 5)\n\n" +
        "⏰ <b>Update frequency:</b> Every 5 minutes\n\n" +
        "💡 <b>Commands:</b>\n" +
        "/logout - Stop receiving updates\n" +
        "/help - Show all commands\n\n" +
        "You will start receiving market data shortly!",
      { parse_mode: "HTML" }
    );

    console.log(`✅ User ${userId} started markets bot subscription`);
  } catch (error) {
    console.error("Error in start command:", error);
    await ctx.reply("❌ An error occurred. Please try again later.");
  }
};
