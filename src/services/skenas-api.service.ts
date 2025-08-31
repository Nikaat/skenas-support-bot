import axios from "axios";
import { config } from "../config/config";
import { IFailedInvoice } from "../types";

export class SkenasApiService {
  private apiClient = axios.create({
    baseURL: config.skenas.apiBaseUrl,
    timeout: 10000,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.skenas.apiKey}`,
    },
  });

  /**
   * Fetch failed invoices by date range
   */
  public async getFailedInvoicesByDateRange(
    startDate: Date,
    endDate: Date,
    limit: number = 20
  ): Promise<IFailedInvoice[]> {
    try {
      const response = await this.apiClient.get(
        "/api/failed-invoices/date-range",
        {
          params: {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            limit,
          },
        }
      );

      return response.data.data || [];
    } catch (error) {
      throw new Error("Failed to fetch failed invoices from Skenas API");
    }
  }

  /**
   * Test API connection
   */
  public async testConnection(): Promise<boolean> {
    try {
      await this.apiClient.get("/api/health");
      return true;
    } catch (error) {
      return false;
    }
  }
}

export const skenasApiService = new SkenasApiService();
