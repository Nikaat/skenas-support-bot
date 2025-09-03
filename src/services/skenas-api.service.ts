import { config } from "../config/config";
import { IInvoiceUpdateRequest } from "../types";

export class SkenasApiService {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor() {
    this.baseUrl = config.skenasbaseurl;
    this.apiKey = config.bot.apiKey;
  }

  /**
   * Update invoice status in the main Skenas application
   */
  public async updateInvoiceStatus(
    updateRequest: IInvoiceUpdateRequest
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/telegram-bot/update-invoice`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            trackId: updateRequest.trackId,
            newStatus: updateRequest.newStatus,
            referenceId: updateRequest.referenceId,
          }),
        }
      );

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        return {
          success: false,
          error:
            errorData.error ||
            `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json();
      return {
        success: true,
        data,
      };
    } catch (error) {
      console.error("Error updating invoice status:", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }
}

export const skenasApiService = new SkenasApiService();
