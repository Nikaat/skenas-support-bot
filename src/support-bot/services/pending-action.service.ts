// services/pending-action.service.ts
import redis from "../../utils/redis";
import { INVOICE_STATUS } from "../../enums/support-bot-enums";

export type PendingCryptoAction = {
  kind: "crypto_confirm";
  trackId: string;
  status: INVOICE_STATUS;
  // we'll capture referenceId on the next text message
};

export type PendingCashOutAction = {
  kind: "cashout_confirm";
  trackId: string;
  status: INVOICE_STATUS;
  // we'll capture referenceId on the next text message
};

export type PendingAction = PendingCryptoAction | PendingCashOutAction;

class PendingActionService {
  private readonly key = (chatId: string) => `pending_action:${chatId}`;
  private readonly ttlSeconds = 10 * 60; // 10 minutes

  async set(chatId: string, action: PendingAction): Promise<void> {
    // Use Redis EX option as positional argument for expiry
    await redis.set(
      this.key(chatId),
      JSON.stringify(action),
      "EX",
      this.ttlSeconds
    );
  }

  async get(chatId: string): Promise<PendingAction | null> {
    const s = await redis.get(this.key(chatId));
    if (!s) return null;
    try {
      return JSON.parse(s) as PendingAction;
    } catch {
      await this.clear(chatId);
      return null;
    }
  }

  async clear(chatId: string): Promise<void> {
    await redis.del(this.key(chatId));
  }
}

export const pendingActionService = new PendingActionService();
