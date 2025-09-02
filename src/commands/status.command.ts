import { Context } from "telegraf";
import { adminAuthService } from "../services/admin-auth.service";
import { config } from "../config/config";
import redis from "../config/redis";

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
        // Gather system information
        const activeSessions = await adminAuthService.getActiveAdminSessions();
        const redisInfo = await getRedisInfo();
        const systemInfo = getSystemInfo();

        const statusText = formatStatusMessage({
          activeSessions: activeSessions.length,
          botUptime: process.uptime(),
          redisInfo,
          systemInfo,
          adminPhoneNumbers: config.admin.phoneNumbers,
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

// Helper function to get Redis information
async function getRedisInfo() {
  try {
    const info = await redis.info("memory");
    const keyspace = await redis.info("keyspace");
    const connectedClients = await redis.info("clients");

    return {
      connected: true,
      memory: info,
      keyspace,
      clients: connectedClients,
    };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Helper function to get system information
function getSystemInfo() {
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();

  return {
    memory: {
      rss: Math.round(memUsage.rss / 1024 / 1024), // MB
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
    },
    cpu: {
      user: cpuUsage.user,
      system: cpuUsage.system,
    },
    nodeVersion: process.version,
    platform: process.platform,
    pid: process.pid,
  };
}

function formatStatusMessage(status: {
  activeSessions: number;
  botUptime: number;
  redisInfo: any;
  systemInfo: any;
  adminPhoneNumbers: string[];
}): string {
  const uptimeHours = Math.floor(status.botUptime / 3600);
  const uptimeMinutes = Math.floor((status.botUptime % 3600) / 60);
  const uptimeDays = Math.floor(uptimeHours / 24);

  let result = `📊 <b>وضعیت کامل سیستم ربات هشدار تراکنش‌های ناموفق</b>\n\n`;

  // Bot Status
  result += `🤖 <b>وضعیت ربات:</b> 🟢 فعال\n`;
  result += `⏱️ <b>زمان کار:</b> ${uptimeDays} روز، ${
    uptimeHours % 24
  } ساعت ${uptimeMinutes} دقیقه\n`;
  result += `🆔 <b>Process ID:</b> ${status.systemInfo.pid}\n\n`;

  // Admin Sessions
  result += `👥 <b>ادمین‌های فعال:</b> ${status.activeSessions}\n`;
  result += `📱 <b>شماره‌های ادمین:</b> ${status.adminPhoneNumbers.length}\n\n`;

  // Redis Status
  if (status.redisInfo.connected) {
    result += `🔴 <b>Redis:</b> 🟢 متصل\n`;
    try {
      const memoryMatch = status.redisInfo.memory.match(
        /used_memory_human:([^\r\n]+)/
      );
      if (memoryMatch) {
        result += `💾 <b>حافظه Redis:</b> ${memoryMatch[1].trim()}\n`;
      }
    } catch (e) {
      // Ignore parsing errors
    }
  } else {
    result += `🔴 <b>Redis:</b> 🔴 قطع شده\n`;
  }
  result += `\n`;

  // System Resources
  result += `💻 <b>منابع سیستم:</b>\n`;
  result += `📊 <b>حافظه استفاده شده:</b> ${status.systemInfo.memory.heapUsed} MB\n`;
  result += `📊 <b>حافظه کل:</b> ${status.systemInfo.memory.heapTotal} MB\n`;
  result += `🖥️ <b>پلتفرم:</b> ${status.systemInfo.platform}\n`;
  result += `⚙️ <b>Node.js:</b> ${status.systemInfo.nodeVersion}\n\n`;

  // API Endpoints
  result += `🔗 <b>API Endpoints:</b>\n`;
  result += `• <code>GET /health</code> - بررسی سلامت\n`;
  result += `• <code>GET /api/bot-status</code> - وضعیت ربات\n`;
  result += `• <code>POST /api/notify</code> - ارسال هشدار\n`;
  result += `• <code>POST /api/test-notification</code> - تست هشدار\n\n`;

  // Overall Status
  const overallStatus = status.redisInfo.connected ? "🟢" : "🟡";
  result += `📈 <b>وضعیت کلی:</b> ${overallStatus} ${
    status.redisInfo.connected ? "آماده دریافت هشدارها" : "آماده (Redis قطع)"
  }`;

  return result;
}
