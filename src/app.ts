import express from 'express';
import cors from 'cors';
import { config } from './config/config';
import { telegramBot } from './bot/telegram-bot';
import { adminAuthService } from './services/admin-auth.service';

const app = express();

// --- Global Middlewares ---
app.use(cors());
app.use(express.json());

// --- Health Check Endpoint ---
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.bot.nodeEnv,
    adminPhoneNumbers: config.admin.phoneNumbers,
    activeSessions: adminAuthService.getActiveAdminSessions().length,
  });
});

// --- Admin Phone Numbers Endpoint ---
app.get('/api/admin-phone-numbers', (req, res) => {
  res.json({
    success: true,
    data: {
      phoneNumbers: config.admin.phoneNumbers,
      count: config.admin.phoneNumbers.length,
    },
  });
});

// --- Error Handler ---
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Express error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
  });
});

// --- 404 Handler ---
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
  });
});

// --- Main Application Logic ---
async function startApplication(): Promise<void> {
  try {
    console.log('🚀 Starting Skenas Telegram Bot...');
    console.log(`🌍 Environment: ${config.bot.nodeEnv}`);
    console.log(`🔌 Port: ${config.bot.port}`);
    console.log(`👥 Admin phone numbers: ${config.admin.phoneNumbers.join(', ')}`);

    // Start HTTP server
    const server = app.listen(config.bot.port, () => {
      console.log(`✅ HTTP server running on port ${config.bot.port}`);
    });

    // Start Telegram bot
    console.log('🤖 Starting Telegram bot...');
    await telegramBot.start();

    // Setup cleanup interval (every hour)
    setInterval(
      () => {
        adminAuthService.cleanupExpiredSessions();
      },
      60 * 60 * 1000,
    );

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);

      server.close(() => {
        console.log('✅ HTTP server closed');
      });

      await telegramBot.stop();
      console.log('✅ Graceful shutdown completed');
      process.exit(0);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    console.log('🎉 Skenas Telegram Bot is ready!');
    console.log('📱 Use /start in Telegram to begin');
  } catch (error) {
    console.error('❌ Failed to start application:', error);
    process.exit(1);
  }
}

// Start the application
startApplication().catch((error) => {
  console.error('❌ Application startup failed:', error);
  process.exit(1);
});
