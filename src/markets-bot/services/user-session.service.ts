import redis from "../../utils/redis";

export class UserSessionService {
  private readonly SESSION_KEY_PREFIX = "markets_bot:subscribed_users";

  constructor() {
    // Using the shared Redis instance from utils/redis.ts
  }

  public async subscribeUser(userId: number): Promise<void> {
    try {
      await redis.sadd(this.SESSION_KEY_PREFIX, userId.toString());
      console.log(`✅ User ${userId} subscribed to markets bot (Redis)`);
    } catch (error) {
      console.error(`❌ Error subscribing user ${userId}:`, error);
      throw error;
    }
  }

  public async unsubscribeUser(userId: number): Promise<void> {
    try {
      await redis.srem(this.SESSION_KEY_PREFIX, userId.toString());
      console.log(`❌ User ${userId} unsubscribed from markets bot (Redis)`);
    } catch (error) {
      console.error(`❌ Error unsubscribing user ${userId}:`, error);
      throw error;
    }
  }

  public async isUserSubscribed(userId: number): Promise<boolean> {
    try {
      const isMember = await redis.sismember(
        this.SESSION_KEY_PREFIX,
        userId.toString()
      );
      return Boolean(isMember);
    } catch (error) {
      console.error(
        `❌ Error checking subscription for user ${userId}:`,
        error
      );
      return false;
    }
  }

  public async getAllSubscribedUsers(): Promise<number[]> {
    try {
      const userIds = await redis.smembers(this.SESSION_KEY_PREFIX);
      return userIds.map((id) => parseInt(id, 10)).filter((id) => !isNaN(id));
    } catch (error) {
      console.error("❌ Error getting all subscribed users:", error);
      return [];
    }
  }

  public async getSubscribedUsersCount(): Promise<number> {
    try {
      return await redis.scard(this.SESSION_KEY_PREFIX);
    } catch (error) {
      console.error("❌ Error getting subscribed users count:", error);
      return 0;
    }
  }

  public async clearAllSubscriptions(): Promise<void> {
    try {
      await redis.del(this.SESSION_KEY_PREFIX);
      console.log("🗑️ Cleared all markets bot subscriptions");
    } catch (error) {
      console.error("❌ Error clearing all subscriptions:", error);
      throw error;
    }
  }
}

export const userSessionService = new UserSessionService();
