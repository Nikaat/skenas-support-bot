import { Context } from 'telegraf';

export const helpCommand = {
  command: 'help',
  description: 'Show available commands',
  handler: async (ctx: Context): Promise<void> => {
    try {
      const helpText = `
🤖 <b>Skenas Admin Bot - Help</b>

<b>Available Commands:</b>

/start - Start the bot and verify admin access
/logs - View failed transaction logs (admin only)
/logout - End your admin session
/help - Show this help message
/status - Check bot and API connection status

<b>How to use:</b>

1️⃣ Use /start to begin authentication
2️⃣ Share your phone number when prompted
3️⃣ If you're an admin, you'll be authenticated
4️⃣ Use /logs to view failed transaction logs
5️⃣ Use /logout when you're done

<b>Note:</b> Only users with admin privileges can access the logs.

<b>Support:</b> Contact your system administrator for assistance.
      `.trim();

      await ctx.reply(helpText, { parse_mode: 'HTML' });
    } catch (error) {
      console.error('Error in help command:', error);
      await ctx.reply('❌ An error occurred while showing help. Please try again later.');
    }
  },
};
