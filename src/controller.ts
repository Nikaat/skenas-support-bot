import { Request, Response } from "express";
import { adminAuthService } from "./bots/support-bot/services/admin-auth.service";
import { config } from "./utils/config";
import { telegramSupportBot } from "./bots/support-bot/bot/telegram-bot";

class BotController {
  async getHealth(req: Request, res: Response) {
    res.status(200).json({ status: "OK" });
  }

  async getBotStatus(req: Request, res: Response) {
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
  }

  async testNotification(req: Request, res: Response) {
    try {
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
  }

  async getAdminPhoneNumbers(req: Request, res: Response) {
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
  }
  async notify(req: Request, res: Response) {
    try {
      const {
        message,
        type,
        priority = "normal",
        meta: rawMeta,
      } = req.body as {
        message?: string;
        type?: string;
        priority?: "low" | "normal" | "high";
        meta?: any;
      };

      // Validate message
      if (!message || typeof message !== "string") {
        return res.status(400).json({
          success: false,
          error: "Message is required and must be a string",
        });
      }

      // Parse meta (may come as object or string)
      let meta: any = {};

      if (rawMeta) {
        if (typeof rawMeta === "string") {
          try {
            meta = JSON.parse(rawMeta);
          } catch (e) {
            console.warn("⚠️ Failed to parse meta JSON:", rawMeta);
            meta = {};
          }
        } else if (typeof rawMeta === "object") {
          meta = rawMeta;
        }
      }

      let sentCount = 0;

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
  }

  async sendAuthInfo(req: Request, res: Response) {
    try {
      return res.json({
        success: true,
        data: {
          authInfo: config.bot.apiKey,
        },
      });
    } catch (error) {
      console.error("Error sending auth info:", error);
      return res
        .status(500)
        .json({ success: false, error: "Internal server error" });
    }
  }
}

export const botController = new BotController();
