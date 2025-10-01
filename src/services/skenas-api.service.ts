import axios from "axios";
import { config } from "../config/config";
import { ICryptoInvoiceConfirmation } from "../types";

export class SkenasApiService {
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
   * Update crypto invoice status in the main application
   */
  async updateCryptoInvoiceStatus(
    confirmation: ICryptoInvoiceConfirmation
  ): Promise<boolean> {
    try {
      if (!this.apiKey) {
        console.error(
          "Cannot update crypto invoice status: SKENAS_API_KEY is not configured"
        );
        return false;
      }

      const response = await axios.patch(
        `https://apitest.skenas.io/api/telegram-bot/cryptocurrency/update-invoice`,
        {
          trackId: confirmation.trackId,
          newStatus: confirmation.status,
          referenceId: confirmation.referenceNumber,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          timeout: 10000,
        }
      );

      if (response.status === 200) {
        const responseData = response.data;

        if (responseData.status === "DONE") {
          console.log(
            `✅ Crypto invoice status updated successfully for trackId: ${confirmation.trackId}`
          );
          if (responseData.result?.message) {
            console.log(`📝 Response message: ${responseData.result.message}`);
          }
          return true;
        } else if (responseData.status === "FAILED") {
          console.error(
            `❌ Crypto invoice status update failed for trackId: ${confirmation.trackId}`
          );
          if (responseData.error) {
            console.error(`Error code: ${responseData.error.code}`);
            console.error(`Error message: ${responseData.error.message}`);
          }
          return false;
        } else {
          console.warn(`⚠️ Unexpected response status: ${responseData.status}`);
          return false;
        }
      } else {
        console.warn(
          `⚠️ Crypto invoice status update returned HTTP status: ${response.status}`
        );
        return false;
      }
    } catch (error) {
      console.error("Failed to update crypto invoice status:", error);

      // Enhanced error handling
      if (axios.isAxiosError(error)) {
        if (error.response) {
          if (error.response.status === 401) {
            console.error("❌ Unauthorized: Missing or invalid API key");
          } else if (error.response.status === 404) {
            console.error("❌ Not Found: Crypto invoice not found");
          } else if (error.response.status === 400) {
            console.error("❌ Bad Request: Invalid confirmation data");
          } else {
            console.error(
              `Main app API responded with status ${error.response.status}:`,
              error.response.data
            );
          }
        } else if (error.request) {
          // Check for connection refused errors
          if (error.code === "ECONNREFUSED") {
            console.error(
              `❌ Connection Refused: Main app server is not running at ${this.baseUrl}`
            );
            console.error(
              "💡 Please ensure the main Skenas application is running and accessible"
            );
          } else if (error.code === "ENOTFOUND") {
            console.error(`❌ Host Not Found: Cannot resolve ${this.baseUrl}`);
            console.error(
              "💡 Please check the SKENAS_API_BASE_URL configuration"
            );
          } else if (error.code === "ETIMEDOUT") {
            console.error(
              "❌ Request Timeout: Main app server did not respond within timeout period"
            );
          } else {
            console.error(
              "❌ Main app API request failed - no response received"
            );
            console.error(`Error code: ${error.code}`);
          }
        } else {
          console.error("❌ Main app API request setup failed:", error.message);
        }
      }

      return false;
    }
  }

  /**
   * Update cash out invoice status in the main application
   */
  async updateCashOutInvoiceStatus(
    confirmation: ICryptoInvoiceConfirmation
  ): Promise<boolean> {
    try {
      if (!this.apiKey) {
        console.error(
          "Cannot update cash out invoice status: SKENAS_API_KEY is not configured"
        );
        return false;
      }

      const response = await axios.patch(
        `https://apitest.skenas.io/api/telegram-bot/wallet/cash-out/update-invoice`,
        {
          trackId: confirmation.trackId,
          newStatus: confirmation.status,
          referenceId: confirmation.referenceNumber,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          timeout: 10000,
        }
      );

      if (response.status === 200) {
        const responseData = response.data;

        if (responseData.status === "DONE") {
          console.log(
            `✅ Cash out invoice status updated successfully for trackId: ${confirmation.trackId}`
          );
          if (responseData.result?.message) {
            console.log(`📝 Response message: ${responseData.result.message}`);
          }
          return true;
        } else if (responseData.status === "FAILED") {
          console.error(
            `❌ Cash out invoice status update failed for trackId: ${confirmation.trackId}`
          );
          if (responseData.error) {
            console.error(`Error code: ${responseData.error.code}`);
            console.error(`Error message: ${responseData.error.message}`);
          }
          return false;
        } else {
          console.warn(`⚠️ Unexpected response status: ${responseData.status}`);
          return false;
        }
      } else {
        console.warn(
          `⚠️ Cash out invoice status update returned HTTP status: ${response.status}`
        );
        return false;
      }
    } catch (error) {
      console.error("Failed to update cash out invoice status:", error);

      // Enhanced error handling
      if (axios.isAxiosError(error)) {
        if (error.response) {
          if (error.response.status === 401) {
            console.error("❌ Unauthorized: Missing or invalid API key");
          } else if (error.response.status === 404) {
            console.error("❌ Not Found: Cash out invoice not found");
          } else if (error.response.status === 400) {
            console.error("❌ Bad Request: Invalid confirmation data");
          } else {
            console.error(
              `Main app API responded with status ${error.response.status}:`,
              error.response.data
            );
          }
        } else if (error.request) {
          // Check for connection refused errors
          if (error.code === "ECONNREFUSED") {
            console.error(
              `❌ Connection Refused: Main app server is not running at ${this.baseUrl}`
            );
            console.error(
              "💡 Please ensure the main Skenas application is running and accessible"
            );
          } else if (error.code === "ENOTFOUND") {
            console.error(`❌ Host Not Found: Cannot resolve ${this.baseUrl}`);
            console.error(
              "💡 Please check the SKENAS_API_BASE_URL configuration"
            );
          } else if (error.code === "ETIMEDOUT") {
            console.error(
              "❌ Request Timeout: Main app server did not respond within timeout period"
            );
          } else {
            console.error(
              "❌ Main app API request failed - no response received"
            );
            console.error(`Error code: ${error.code}`);
          }
        } else {
          console.error("❌ Main app API request setup failed:", error.message);
        }
      }

      return false;
    }
  }

  /**
   * Check main app health status
   */
  async checkMainAppHealth(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.baseUrl}/health`, {
        timeout: 5000,
      });
      return response.status === 200;
    } catch (error) {
      console.error("Main app health check failed:", error);
      return false;
    }
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      if (!this.apiKey) {
        console.error(
          "Cannot test connection: SKENAS_API_KEY is not configured"
        );
        return false;
      }

      const response = await axios.get(`${this.baseUrl}/api/test`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        timeout: 5000,
      });

      return response.status === 200;
    } catch (error) {
      console.error("API connection test failed:", error);
      return false;
    }
  }
}

export const skenasApiService = new SkenasApiService();
