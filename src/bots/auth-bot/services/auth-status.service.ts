import axios from "axios";
import { config } from "../../../utils/config";

export class AuthStatusService {
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
   * Update auth status in the main application
   * @param userId - User ID
   * @param status - Status: "verified" for success, "registering" for rejected
   * @param reason - Optional rejection reason (required when status is "registering")
   */
  async updateAuthStatus(
    userId: string,
    status: "verified" | "registering",
    reason?: string
  ): Promise<boolean> {
    try {
      if (!this.apiKey) {
        console.error(
          "Cannot update auth status: TELEGRAM_BOT_API_KEY is not configured"
        );
        return false;
      }

      if (!userId || typeof userId !== "string") {
        console.error("Invalid userId provided");
        return false;
      }

      if (status !== "verified" && status !== "registering") {
        console.error(
          `Invalid status: ${status}. Must be "verified" or "registering"`
        );
        return false;
      }

      if (status === "registering" && !reason) {
        console.error("Reason is required when status is 'registering'");
        return false;
      }

      const payload: { userId: string; status: string; reason?: string } = {
        userId,
        status,
      };

      if (reason) {
        payload.reason = reason;
      }

      const { data } = await axios.post(
        `https://apitest.skenas.io/api/telegram-bot/auth/update-status`,
        payload,
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
        console.log(
          `✅ Auth status updated successfully for user ${userId}: ${status}`
        );
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
      console.error("Failed to update auth status:", error);
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
        console.error("❌ Not Found: User not found or endpoint not found");
      } else if (error.response.status === 400) {
        console.error("❌ Bad Request: Invalid request data");
      } else {
        console.error(
          `Auth Status API responded with status ${error.response.status}:`,
          error.response.data
        );
      }
      return;
    }

    if (error.request) {
      if (error.code === "ECONNREFUSED") {
        console.error(
          `❌ Connection Refused: Skenas API server is not running at ${this.baseUrl}`
        );
        console.error(
          "💡 Please ensure the Skenas API server is running and accessible"
        );
      } else if (error.code === "ENOTFOUND") {
        console.error(`❌ Host Not Found: Cannot resolve ${this.baseUrl}`);
        console.error("💡 Please check the SKENAS_API_BASE_URL configuration");
      } else if (error.code === "ETIMEDOUT") {
        console.error(
          "❌ Request Timeout: Skenas API server did not respond within timeout period"
        );
      } else {
        console.error(
          "❌ Auth Status API request failed - no response received"
        );
        console.error(`Error code: ${error.code}`);
      }
      return;
    }

    console.error("❌ Auth Status API request setup failed:", error.message);
  }
}

export const authStatusService = new AuthStatusService();
