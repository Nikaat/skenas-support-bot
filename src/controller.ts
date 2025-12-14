import { Request, Response } from "express";
import { adminAuthService } from "./bots/support-bot/services/admin-auth.service";
import { config } from "./utils/config";
import { telegramSupportBot } from "./bots/support-bot/bot/telegram-bot";
import { authBot } from "./bots/auth-bot/bot/auth-bot";

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

  async submitAuthFiles(req: Request, res: Response) {
    try {
      const { userId, userInfo, videoUrl, identityDocumentUrl } = req.body as {
        userId: string;
        userInfo?: {
          name: string;
          serialNumber?: string;
          birthDate: string;
          nationalCode: string;
        };
        videoUrl?: string;
        identityDocumentUrl?: string;
      };

      // Validate userId
      if (!userId || typeof userId !== "string") {
        return res.status(400).json({
          success: false,
          error: "userId is required and must be a string",
        });
      }

      // Validate userInfo
      if (!userInfo || typeof userInfo !== "object") {
        return res.status(400).json({
          success: false,
          error: "userInfo is required and must be an object",
        });
      }

      if (!userInfo.name || typeof userInfo.name !== "string") {
        return res.status(400).json({
          success: false,
          error: "userInfo.name is required and must be a string",
        });
      }

      if (!userInfo.birthDate || typeof userInfo.birthDate !== "string") {
        return res.status(400).json({
          success: false,
          error: "userInfo.birthDate is required and must be a string",
        });
      }

      if (!userInfo.nationalCode || typeof userInfo.nationalCode !== "string") {
        return res.status(400).json({
          success: false,
          error: "userInfo.nationalCode is required and must be a string",
        });
      }

      // Validate that at least one URL is provided
      if (!videoUrl && !identityDocumentUrl) {
        return res.status(400).json({
          success: false,
          error:
            "At least one file URL (videoUrl or identityDocumentUrl) must be provided",
        });
      }

      // Validate URLs format
      const urlPattern = /^https?:\/\/.+/;
      if (videoUrl && !urlPattern.test(videoUrl)) {
        return res.status(400).json({
          success: false,
          error: "videoUrl must be a valid HTTP/HTTPS URL",
        });
      }
      if (identityDocumentUrl && !urlPattern.test(identityDocumentUrl)) {
        return res.status(400).json({
          success: false,
          error: "identityDocumentUrl must be a valid HTTP/HTTPS URL",
        });
      }

      console.log(`📤 Received auth file URLs for user ${userId}:`, {
        hasVideoUrl: !!videoUrl,
        hasIdentityDocumentUrl: !!identityDocumentUrl,
        userInfo,
      });

      // Send files to admins via auth bot
      const sentCount = await authBot.sendAuthFilesToAllAdmins(
        userId,
        userInfo,
        videoUrl,
        identityDocumentUrl
      );

      console.log(`📊 Auth files sent to ${sentCount} admin(s)`);

      return res.json({
        success: true,
        data: {
          message: "Auth files submitted successfully",
          recipients: sentCount,
          userId,
          filesReceived: {
            video: !!videoUrl,
            identityDocument: !!identityDocumentUrl,
          },
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("Error submitting auth files:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }
}

export const botController = new BotController();
