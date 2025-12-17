import redis from "../../../utils/redis";

export type AuthDecisionStatus = "verified" | "registering";

export interface IAuthDecision {
  requestId: string;
  userId: string;
  status: AuthDecisionStatus;
  processedBy: string; // admin phone number
  processedAt: string; // ISO string
}

const DECISION_PREFIX = "auth_decision:";

class AuthDecisionService {
  private getKey(requestId: string): string {
    return `${DECISION_PREFIX}${requestId}`;
  }

  async getDecision(requestId: string): Promise<IAuthDecision | null> {
    const key = this.getKey(requestId);
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
    requestId: string,
    userId: string,
    status: AuthDecisionStatus,
    processedBy: string
  ): Promise<void> {
    const key = this.getKey(requestId);
    const decision: IAuthDecision = {
      requestId,
      userId,
      status,
      processedBy,
      processedAt: new Date().toISOString(),
    };

    await redis.set(key, JSON.stringify(decision));
  }

  async clearDecision(requestId: string): Promise<void> {
    const key = this.getKey(requestId);
    await redis.del(key);
  }
}

export const authDecisionService = new AuthDecisionService();
