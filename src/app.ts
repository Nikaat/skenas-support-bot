import express from "express";
import cors from "cors";
import { config } from "./config/config";
import { telegramBot } from "./bot/telegram-bot";
import { adminAuthService } from "./services/admin-auth.service";

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
    const sentCount = await telegramBot.sendFailedTransactionAlertToAllAdmins(
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
    // Verify API key from main app
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

    // Validate request body
    const { message, priority = "normal" } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        success: false,
        error: "Message is required and must be a string",
      });
    }

    // Send failed transaction alert to all authenticated admins
    const sentCount = await telegramBot.sendFailedTransactionAlertToAllAdmins(
      message,
      priority
    );

    return res.json({
      success: true,
      data: {
        message: "Failed transaction alert sent successfully",
        recipients: sentCount,
        priority,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Error sending failed transaction alert:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
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
      console.log(`✅ HTTP server running on port ${config.bot.port}`);
    });

    // Start Telegram bot
    await telegramBot.start();

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      server.close(() => {
        console.log("✅ HTTP server closed");
      });

      await telegramBot.stop();
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
