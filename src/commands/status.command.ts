import { Context } from 'telegraf';
import { adminAuthService } from '../services/admin-auth.service';
import { skenasApiService } from '../services/skenas-api.service';

export const statusCommand = {
  command: 'status',
  description: 'Check bot and API connection status',
  handler: async (ctx: Context): Promise<void> => {
    try {
      const chatId = ctx.chat?.id;
      if (!chatId) {
        await ctx.reply('❌ Unable to identify chat. Please try again.');
        return;
      }

      // Check if user is authenticated as admin
      const session = adminAuthService.getAdminSession(chatId.toString());
      if (!session) {
        await ctx.reply(
          '❌ You are not authenticated as an admin.\n\n' +
            'Please use /start to begin the authentication process.',
        );
        return;
      }

      // Show loading message
      const loadingMsg = await ctx.reply('⏳ Checking system status...');

      try {
        // Check API connection
        const apiStatus = await skenasApiService.testConnection();

        // Get active admin sessions count
        const activeSessions = adminAuthService.getActiveAdminSessions();

        // Format status message
        const statusText = formatStatusMessage({
          apiStatus,
          activeSessions: activeSessions.length,
          botUptime: process.uptime(),
        });

        // Update loading message with status
        await ctx.telegram.editMessageText(chatId, loadingMsg.message_id, undefined, statusText, {
          parse_mode: 'HTML',
        });
      } catch (error) {
        console.error('Error checking status:', error);
        await ctx.telegram.editMessageText(
          chatId,
          loadingMsg.message_id,
          undefined,
          '❌ Failed to check system status.\n\n' + 'Please try again later.',
        );
      }
    } catch (error) {
      console.error('Error in status command:', error);
      await ctx.reply('❌ An error occurred while checking status. Please try again later.');
    }
  },
};

function formatStatusMessage(status: {
  apiStatus: boolean;
  activeSessions: number;
  botUptime: number;
}): string {
  const uptimeHours = Math.floor(status.botUptime / 3600);
  const uptimeMinutes = Math.floor((status.botUptime % 3600) / 60);

  let result = `📊 <b>System Status Report</b>\n\n`;

  // API status
  result += `🔌 <b>Main App API:</b> `;
  result += status.apiStatus ? '🟢 Connected' : '🔴 Disconnected';
  result += '\n';

  // Active sessions
  result += `👥 <b>Active Admin Sessions:</b> ${status.activeSessions}\n`;

  // Bot uptime
  result += `⏱️ <b>Bot Uptime:</b> ${uptimeHours}h ${uptimeMinutes}m\n`;

  // Overall status
  const overallStatus = status.apiStatus ? '🟢' : '🔴';
  result += `\n📈 <b>Overall Status:</b> ${overallStatus} `;
  result += status.apiStatus ? 'All systems operational' : 'Some systems down';

  // Recommendations
  if (!status.apiStatus) {
    result += '\n\n⚠️ <b>Recommendation:</b> Check main application API';
  }

  return result;
}
