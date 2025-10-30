import express from "express";
import cors from "cors";
import { config } from "./utils/config";
import { telegramSupportBot } from "./support-bot/bot/telegram-bot";
import { telegramMarketsBot } from "./markets-bot/bot/telegram-bot";
import { telegramNotifBot } from "./notif-bot/bot/telegram-bot";
import { adminAuthService } from "./support-bot/services/admin-auth.service";

const app = express();

// --- Global Middlewares ---
app.use(cors());
app.use(express.json());

// --- Health Check Endpoint (Simple) ---
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK" });
});

// --- Bot Status Endpoint ---
app.get("/api/bot-status", async (req, res) => {
  try {
    const activeSessions = await adminAuthService.getActiveAdminSessions();

    res.json({
      success: true,
      data: {
        status: "OK",
        uptime: process.uptime(),
        activeAdmins: activeSessions.length,
        adminPhoneNumbers: config.admin.phoneNumbers,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

// --- Test Notification Endpoint ---
app.post("/api/test-notification", async (req, res) => {
  try {
    // Verify API key
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        error: "Missing or invalid authorization header",
      });
    }

    const apiKey = authHeader.substring(7);
    if (apiKey !== config.bot.apiKey) {
      return res.status(403).json({
        success: false,
        error: "Invalid API key - Access denied",
      });
    }

    // Send test notification to all active admin sessions
    const testMessage =
      "🧪 <b>تست سیستم هشدار</b>\n\nاین یک پیام تست برای بررسی عملکرد ربات است.";
    const sentCount =
      await telegramSupportBot.sendFailedTransactionAlertToAllAdmins(
        testMessage,
        "normal"
      );

    return res.json({
      success: true,
      data: {
        message: "Test notification sent successfully",
        recipients: sentCount,
        testMessage,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Error sending test notification:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

// --- Admin Phone Numbers Endpoint ---
app.get("/api/admin-phone-numbers", (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        phoneNumbers: config.admin.phoneNumbers,
        count: config.admin.phoneNumbers.length,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});
// --- Failed Transaction Notification Endpoint ---
app.post("/api/notify", async (req, res) => {
  try {
    // auth as before ...
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        error: "Missing or invalid authorization header",
      });
    }
    const apiKey = authHeader.substring(7);
    if (apiKey !== config.bot.apiKey) {
      return res
        .status(403)
        .json({ success: false, error: "Invalid API key - Access denied" });
    }

    // NEW: type + meta supported
    const {
      message,
      priority = "normal",
      type,
      meta,
    } = req.body as {
      message: string;
      priority?: "low" | "normal" | "high";
      type?: string;
      meta?: Record<string, any>;
    };

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        success: false,
        error: "Message is required and must be a string",
      });
    }

    let sentCount = 0;

    // If cryptocurrency and we have trackId, send with inline keyboard
    if (type === "cryptocurrency" && meta?.trackId) {
      console.log(
        `📱 Sending crypto transaction alert for trackId: ${meta.trackId}`
      );
      sentCount =
        await telegramSupportBot.sendCryptoTransactionAlertToAllAdmins(
          message,
          String(meta.trackId),
          priority
        );
    } else if (
      (type === "cashout" || type === "skenas_wallet") &&
      meta?.trackId
    ) {
      // If cash out (or skenas_wallet) and we have trackId, send with inline keyboard
      console.log(
        `📱 Sending cash out transaction alert for trackId: ${meta.trackId} (type: ${type})`
      );
      sentCount =
        await telegramSupportBot.sendCashOutTransactionAlertToAllAdmins(
          message,
          String(meta.trackId),
          priority
        );
    } else {
      // fallback to plain broadcast
      console.log(
        `📱 Sending failed transaction alert (type: ${type || "generic"})`
      );
      sentCount =
        await telegramSupportBot.sendFailedTransactionAlertToAllAdmins(
          message,
          priority
        );
    }

    console.log(`📊 Notification sent to ${sentCount} admin(s)`);

    return res.json({
      success: true,
      data: {
        message: "Notification sent successfully",
        recipients: sentCount,
        priority,
        type: type || "generic",
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Error sending notification:", error);
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  }
});

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
    console.log("🚀 Starting both bots...");

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
