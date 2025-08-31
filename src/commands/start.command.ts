import { Context } from 'telegraf';
import { adminAuthService } from '../services/admin-auth.service';

export const startCommand = {
  command: 'start',
  description: 'Start the bot and verify admin access',
  handler: async (ctx: Context): Promise<void> => {
    try {
      const chatId = ctx.chat?.id;
      if (!chatId) {
        await ctx.reply('❌ Unable to identify chat. Please try again.');
        return;
      }

      // Check if user already has an active session
      const existingSession = adminAuthService.getAdminSession(chatId.toString());

      if (existingSession) {
        await ctx.reply(
          `✅ Welcome back! You are already authenticated as an admin.\n\n` +
            `Use /logs to view failed transaction logs.\n` +
            `Use /logout to end your session.`,
        );
        return;
      }

      // Send welcome message with phone number request
      await ctx.reply(
        `🤖 Welcome to Skenas Admin Bot!\n\n` +
          `This bot provides access to failed transaction logs for admin users only.\n\n` +
          `To continue, please share your phone number by clicking the button below:`,
        {
          reply_markup: {
            keyboard: [[{ text: '📱 Share Phone Number', request_contact: true }]],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        },
      );
    } catch (error) {
      console.error('Error in start command:', error);
      await ctx.reply('❌ An error occurred. Please try again later.');
    }
  },
};
