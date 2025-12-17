import redis from "../../../utils/redis";

export type PendingAuthAction = {
  kind: "auth_reject";
  requestId: string;
  userId: string;
  status: "registering";
};

class PendingAuthActionService {
  private readonly key = (chatId: string) => `pending_auth_action:${chatId}`;
  private readonly ttlSeconds = 10 * 60; // 10 minutes

  async set(chatId: string, action: PendingAuthAction): Promise<void> {
    await redis.set(
      this.key(chatId),
      JSON.stringify(action),
      "EX",
      this.ttlSeconds
    );
  }

  async get(chatId: string): Promise<PendingAuthAction | null> {
    const s = await redis.get(this.key(chatId));
    if (!s) return null;
    try {
      return JSON.parse(s) as PendingAuthAction;
    } catch {
      await this.clear(chatId);
      return null;
    }
  }

  async clear(chatId: string): Promise<void> {
    await redis.del(this.key(chatId));
  }
}

export const pendingAuthActionService = new PendingAuthActionService();
