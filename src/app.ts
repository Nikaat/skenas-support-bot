import express from "express";
import cors from "cors";
import { config } from "./config/config";
import { telegramBot } from "./bot/telegram-bot";
import { adminAuthService } from "./services/admin-auth.service";

const app = express();

// --- Global Middlewares ---
app.use(cors());
app.use(express.json());

// --- Health Check Endpoint ---
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.bot.nodeEnv,
  });
});

// --- Notification Endpoint ---
app.post("/api/notify", async (req, res) => {
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
    if (apiKey !== config.skenas.apiKey) {
      return res.status(403).json({
        success: false,
        error: "Invalid API key",
      });
    }

    // Validate request bod
    const { message, priority = "normal" } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        success: false,
        error: "Message is required and must be a string",
      });
    }

    // Send notification to all active admin sessions
    const sentCount = await telegramBot.sendNotificationToAllAdmins(
      message,
      priority
    );

    return res.json({
      success: true,
      data: {
        message: "Notification sent successfully",
        recipients: sentCount,
        priority,
      },
    });
  } catch (error) {
    console.error("Error processing notification:", error);
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
