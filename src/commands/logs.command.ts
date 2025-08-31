import { Context } from 'telegraf';
import { adminAuthService } from '../services/admin-auth.service';
import { skenasApiService } from '../services/skenas-api.service';

export const logsCommand = {
  command: 'logs',
  description: 'View failed transaction logs',
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
      const loadingMsg = await ctx.reply('⏳ Fetching failed transaction logs...');

      try {
        // Fetch recent failed invoices (last 24 hours)
        const endDate = new Date();
        const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

        const failedInvoices = await skenasApiService.getFailedInvoicesByDateRange(
          startDate,
          endDate,
          20, // Limit to 20 most recent
        );

        if (failedInvoices.length === 0) {
          await ctx.telegram.editMessageText(
            chatId,
            loadingMsg.message_id,
            undefined,
            '✅ No failed transactions found in the last 24 hours.',
          );
          return;
        }

        // Format the logs
        const logsText = formatFailedInvoices(failedInvoices);

        // Split long messages if needed (Telegram has 4096 character limit)
        const messageChunks = splitMessage(logsText, 4000);

        // Delete loading message
        await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id);

        // Send logs in chunks
        for (let i = 0; i < messageChunks.length; i++) {
          const chunk = messageChunks[i];
          const isLast = i === messageChunks.length - 1;

          await ctx.reply(chunk + (isLast ? '\n\n💡 Use /logs to refresh the data.' : ''), {
            parse_mode: 'HTML',
          });
        }
      } catch (apiError) {
        console.error('Error fetching logs:', apiError);
        await ctx.telegram.editMessageText(
          chatId,
          loadingMsg.message_id,
          undefined,
          '❌ Failed to fetch logs from the main application.\n\n' +
            'Please check the API connection and try again later.',
        );
      }
    } catch (error) {
      console.error('Error in logs command:', error);
      await ctx.reply('❌ An error occurred while fetching logs. Please try again later.');
    }
  },
};

function formatFailedInvoices(invoices: any[]): string {
  let result = `📊 <b>Failed Transaction Logs</b>\n`;
  result += `📅 Last 24 hours • ${invoices.length} failed transactions\n\n`;

  invoices.forEach((invoice, index) => {
    const date = new Date(invoice.createdAt).toLocaleString('fa-IR');
    const status = invoice.status || 'Unknown';
    const reason = invoice.failedReason || 'No reason provided';

    result += `🔴 <b>Transaction ${index + 1}</b>\n`;
    result += `🆔 Track ID: <code>${invoice.trackId}</code>\n`;
    result += `👤 User ID: <code>${invoice.userId}</code>\n`;
    result += `📱 Service: ${invoice.mainService} > ${invoice.subService}\n`;
    result += `🔍 Method: ${invoice.inquiryMethod}\n`;
    result += `❌ Status: ${status}\n`;
    result += `💬 Reason: ${reason}\n`;
    result += `📅 Date: ${date}\n`;
    result += `\n`;
  });

  return result;
}

function splitMessage(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let currentChunk = '';
  const lines = text.split('\n');

  for (const line of lines) {
    if ((currentChunk + line + '\n').length > maxLength) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }

      // If a single line is too long, split it
      if (line.length > maxLength) {
        const words = line.split(' ');
        let tempLine = '';

        for (const word of words) {
          if ((tempLine + word + ' ').length > maxLength) {
            if (tempLine) {
              chunks.push(tempLine.trim());
              tempLine = '';
            }
            tempLine = word + ' ';
          } else {
            tempLine += word + ' ';
          }
        }

        if (tempLine) {
          currentChunk = tempLine;
        }
      } else {
        currentChunk = line + '\n';
      }
    } else {
      currentChunk += line + '\n';
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}
