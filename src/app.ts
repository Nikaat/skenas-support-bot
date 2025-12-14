import express from "express";
import cors from "cors";
import { config } from "./utils/config";
import { telegramSupportBot } from "./bots/support-bot/bot/telegram-bot";
import { telegramMarketsBot } from "./bots/markets-bot/bot/telegram-bot";
import { telegramNotifBot } from "./bots/notif-bot/bot/telegram-bot";
import { authBot } from "./bots/auth-bot/bot/auth-bot";
import router from "./routes";

const app = express();

// --- Global Middlewares ---
app.use(cors());
app.use(express.json());

app.use("/api", router);

// --- Error Handler ---
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    console.error("Express error:", err);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
);

// --- 404 Handler ---
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint not found",
  });
});

// --- Main Application Logic ---
async function startApplication(): Promise<void> {
  try {
    // Start HTTP server
    const server = app.listen(config.bot.port, () => {
      console.log(`✅ Bot started on port ${config.bot.port}`);
    });

    // Start Telegram bots in parallel
    console.log("🚀 Starting all bots...");

    const startBots = async () => {
      const botPromises = [
        telegramSupportBot
          .start()
          .then(() => {
            console.log("✅ Support Bot started successfully");
          })
          .catch((error) => {
            console.error("❌ Failed to start Support Bot:", error);
          }),

        telegramMarketsBot
          .start()
          .then(() => {
            console.log("✅ Markets Bot started successfully");
          })
          .catch((error) => {
            console.error("❌ Failed to start Markets Bot:", error);
          }),

        telegramNotifBot
          .start()
          .then(() => {
            console.log("✅ Notif Bot started successfully");
          })
          .catch((error) => {
            console.error("❌ Failed to start Notif Bot:", error);
          }),

        authBot
          .start()
          .then(() => {
            console.log("✅ Auth Bot started successfully");
          })
          .catch((error) => {
            console.error("❌ Failed to start Auth Bot:", error);
          }),
      ];

      await Promise.allSettled(botPromises);
      console.log("🎉 Bot startup process completed");
    };

    await startBots();

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      console.log(`🛑 Received ${signal}, shutting down gracefully...`);

      server.close(() => {
        console.log("✅ HTTP server closed");
      });

      try {
        await telegramSupportBot.stop();
        console.log("✅ Support Bot stopped");
      } catch (error) {
        console.error("❌ Error stopping Support Bot:", error);
      }

      try {
        await telegramMarketsBot.stop();
        console.log("✅ Markets Bot stopped");
      } catch (error) {
        console.error("❌ Error stopping Markets Bot:", error);
      }

      try {
        await telegramNotifBot.stop();
        console.log("✅ Notif Bot stopped");
      } catch (error) {
        console.error("❌ Error stopping Notif Bot:", error);
      }

      try {
        await authBot.stop();
        console.log("✅ Auth Bot stopped");
      } catch (error) {
        console.error("❌ Error stopping Auth Bot:", error);
      }

      process.exit(0);
    };

    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  } catch (error) {
    console.error("❌ Failed to start application:", error);
    process.exit(1);
  }
}

// Start the application
startApplication().catch((error) => {
  console.error("❌ Application startup failed:", error);
  process.exit(1);
});
