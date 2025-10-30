import axios from "axios";
import { config } from "../../utils/config";
import { INotificationData } from "../../enums/support-bot-enums";

export class NotifService {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor() {
    this.baseUrl = config.skenas.apiBaseUrl;
    this.apiKey = config.bot.apiKey;

    // Validate API key on initialization
    if (!this.apiKey) {
      console.warn(
        "TELEGRAM_BOT_API_KEY environment variable is not set - API calls will fail"
      );
    }
  }

  /**
   * Send notification to a user
   */
  async sendNotificationToUser(
    notificationData: INotificationData,
    userId: string
  ): Promise<boolean> {
    try {
      if (!this.apiKey) {
        console.error(
          "Cannot send notification to user: TELEGRAM_BOT_API_KEY is not configured"
        );
        return false;
      }

      const { data } = await axios.post(
        `https://apistage.skenas.io/api/push-notification/send-to-user`,
        {
          notificationData,
          userId,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          timeout: 10000,
        }
      );

      // Axios resolves only for 2xx by default; handle API-level status here
      if (data?.status === "DONE") {
        if (data.result?.message) {
          console.log(`📝 Response message: ${data.result.message}`);
        }
        return true;
      }

      if (data?.status === "FAILED") {
        if (data.error) {
          console.error(`Error code: ${data.error.code}`);
          console.error(`Error message: ${data.error.message}`);
        }
        return false;
      }

      console.warn(`⚠️ Unexpected response status: ${data?.status}`);
      return false;
    } catch (error) {
      console.error("Failed to send notification to user:", error);
      this.logAxiosError(error);
      return false;
    }
  }
  /**
   * Broadcast notification to all users
   */
  async broadcastNotification(
    notificationData: INotificationData
  ): Promise<boolean> {
    try {
      if (!this.apiKey) {
        console.error(
          "Cannot send notification to user: TELEGRAM_BOT_API_KEY is not configured"
        );
        return false;
      }

      const { data } = await axios.post(
        `https://apistage.skenas.io/api/push-notification/broadcast`,
        {
          notificationData,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          timeout: 10000,
        }
      );

      // Axios resolves only for 2xx by default; handle API-level status here
      if (data?.status === "DONE") {
        if (data.result?.message) {
          console.log(`📝 Response message: ${data.result.message}`);
        }
        return true;
      }

      if (data?.status === "FAILED") {
        if (data.error) {
          console.error(`Error code: ${data.error.code}`);
          console.error(`Error message: ${data.error.message}`);
        }
        return false;
      }

      console.warn(`⚠️ Unexpected response status: ${data?.status}`);
      return false;
    } catch (error) {
      console.error("Failed to send notification to user:", error);
      this.logAxiosError(error);
      return false;
    }
  }

  private logAxiosError(error: unknown): void {
    if (!axios.isAxiosError(error)) {
      return;
    }

    if (error.response) {
      if (error.response.status === 401) {
        console.error("❌ Unauthorized: Missing or invalid API key");
      } else if (error.response.status === 404) {
        console.error("❌ Not Found: User not found");
      } else if (error.response.status === 400) {
        console.error("❌ Bad Request: Invalid notification data");
      } else {
        console.error(
          `Notification API responded with status ${error.response.status}:`,
          error.response.data
        );
      }
      return;
    }

    if (error.request) {
      if (error.code === "ECONNREFUSED") {
        console.error(
          `❌ Connection Refused: Notification server is not running at ${this.baseUrl}`
        );
        console.error(
          "💡 Please ensure the notification server is running and accessible"
        );
      } else if (error.code === "ENOTFOUND") {
        console.error(`❌ Host Not Found: Cannot resolve ${this.baseUrl}`);
        console.error(
          "💡 Please check the NOTIFICATION_API_BASE_URL configuration"
        );
      } else if (error.code === "ETIMEDOUT") {
        console.error(
          "❌ Request Timeout: Notification server did not respond within timeout period"
        );
      } else {
        console.error(
          "❌ Notification API request failed - no response received"
        );
        console.error(`Error code: ${error.code}`);
      }
      return;
    }

    console.error("❌ Notification API request setup failed:", error.message);
  }
}

export const notifService = new NotifService();
