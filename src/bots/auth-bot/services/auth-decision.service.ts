import redis from "../../../utils/redis";

export type AuthDecisionStatus = "verified" | "registering";

export interface IAuthDecision {
  userId: string;
  status: AuthDecisionStatus;
  processedBy: string; // admin phone number
  processedAt: string; // ISO string
}

const DECISION_PREFIX = "auth_decision:";

class AuthDecisionService {
  private getKey(userId: string): string {
    return `${DECISION_PREFIX}${userId}`;
  }

  async getDecision(userId: string): Promise<IAuthDecision | null> {
    const key = this.getKey(userId);
    const raw = await redis.get(key);
    if (!raw) return null;

    try {
      return JSON.parse(raw) as IAuthDecision;
    } catch (e) {
      console.error("Failed to parse auth decision from redis", e);
      await redis.del(key);
      return null;
    }
  }

  async setDecision(
    userId: string,
    status: AuthDecisionStatus,
    processedBy: string
  ): Promise<void> {
    const key = this.getKey(userId);
    const decision: IAuthDecision = {
      userId,
      status,
      processedBy,
      processedAt: new Date().toISOString(),
    };

    await redis.set(key, JSON.stringify(decision));
  }
}

export const authDecisionService = new AuthDecisionService();
