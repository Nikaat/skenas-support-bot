// services/processed-invoice.service.ts
import redis from "../../../utils/redis";
import { INVOICE_STATUS } from "../../../enums/support-bot-enums";

export interface ProcessedInvoice {
  trackId: string;
  status: INVOICE_STATUS;
  processedBy: string; // phone number of admin who processed it
  processedAt: Date;
  referenceNumber?: string;
}

class ProcessedInvoiceService {
  private readonly key = (trackId: string) => `processed_invoice:${trackId}`;
  private readonly ttlSeconds = 24 * 60 * 60; // 24 hours

  async markAsProcessed(
    trackId: string,
    status: INVOICE_STATUS,
    processedBy: string,
    referenceNumber?: string
  ): Promise<void> {
    const processedInvoice: ProcessedInvoice = {
      trackId,
      status,
      processedBy,
      processedAt: new Date(),
      referenceNumber,
    };

    await redis.set(
      this.key(trackId),
      JSON.stringify(processedInvoice),
      "EX",
      this.ttlSeconds
    );
  }

  async isProcessed(trackId: string): Promise<ProcessedInvoice | null> {
    const s = await redis.get(this.key(trackId));
    if (!s) return null;

    try {
      const processed = JSON.parse(s) as ProcessedInvoice;
      // Convert processedAt back to Date object
      processed.processedAt = new Date(processed.processedAt);
      return processed;
    } catch {
      // If parsing fails, remove the corrupted data
      await redis.del(this.key(trackId));
      return null;
    }
  }

  async getProcessedBy(trackId: string): Promise<string | null> {
    const processed = await this.isProcessed(trackId);
    return processed?.processedBy || null;
  }

  async clear(trackId: string): Promise<void> {
    await redis.del(this.key(trackId));
  }
}

export const processedInvoiceService = new ProcessedInvoiceService();
