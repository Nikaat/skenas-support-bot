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

      const response = await axios.post(
        `${this.baseUrl}/api/crypto-invoice/update-status`,
        {
          trackId: confirmation.trackId,
          status: confirmation.status,
          referenceNumber: confirmation.referenceNumber,
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
        console.log(
          `✅ Crypto invoice status updated successfully for trackId: ${confirmation.trackId}`
        );
        return true;
      } else {
        console.warn(
          `⚠️ Crypto invoice status update returned status: ${response.status}`
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
          console.error("Main app API request failed - no response received");
        } else {
          console.error("Main app API request setup failed:", error.message);
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
