import { config } from "../config/config";
import { IAdminSession } from "../types";
import redis from "../config/redis";

export class AdminAuthService {
  private readonly sessionPrefix = "admin_session:";

  /**
   * Verify if a phone number belongs to an admin user
   */
  public verifyAdminByPhone(phoneNumber: string): boolean {
    return config.admin.phoneNumbers.includes(phoneNumber);
  }

  /**
   * Create admin session for a chat
   */
  public async createAdminSession(
    phoneNumber: string,
    chatId: string
  ): Promise<void> {
    const session: IAdminSession = {
      phoneNumber,
      chatId,
      lastActivity: new Date(),
    };

    const sessionKey = `${this.sessionPrefix}${chatId}`;
    await redis.set(sessionKey, JSON.stringify(session));
  }

  /**
   * Get admin session by chat ID
   */
  public async getAdminSession(chatId: string): Promise<IAdminSession | null> {
    const sessionKey = `${this.sessionPrefix}${chatId}`;
    const sessionData = await redis.get(sessionKey);

    if (!sessionData) {
      return null;
    }

    try {
      const session: IAdminSession = JSON.parse(sessionData);

      // Update last activity
      session.lastActivity = new Date();
      await redis.set(sessionKey, JSON.stringify(session));

      return session;
    } catch (error) {
      console.error("Error parsing session data:", error);
      await redis.del(sessionKey);
      return null;
    }
  }

  /**
   * Remove admin session (logout)
   */
  public async removeAdminSession(chatId: string): Promise<boolean> {
    const sessionKey = `${this.sessionPrefix}${chatId}`;
    const result = await redis.del(sessionKey);
    return result > 0;
  }

  // /**
  //  * Clean up expired sessions (Redis handles TTL automatically)
  //  */
  // public async cleanupExpiredSessions(): Promise<number> {
  //   // Redis automatically handles TTL, so this method is mainly for compatibility
  //   // We can scan for expired sessions if needed
  //   const keys = await redis.keys(`${this.sessionPrefix}*`);
  //   let cleanedCount = 0;

  //   for (const key of keys) {
  //     const ttl = await redis.ttl(key);
  //     if (ttl === -1) {
  //       // Key exists but has no TTL, remove it
  //       await redis.del(key);
  //       cleanedCount++;
  //     }
  //   }

  //   return cleanedCount;
  // }

  /**
   * Check if an admin is authorized for crypto operations
   */
  public isCryptoAuthorizedAdmin(phoneNumber: string): boolean {
    return config.admin.cryptoAuthorizedAdmins.includes(phoneNumber);
  }

  /**
   * Get all active admin sessions
   */
  public async getActiveAdminSessions(): Promise<IAdminSession[]> {
    const keys = await redis.keys(`${this.sessionPrefix}*`);
    const activeSessions: IAdminSession[] = [];

    for (const key of keys) {
      const sessionData = await redis.get(key);
      if (sessionData) {
        try {
          const session: IAdminSession = JSON.parse(sessionData);
          activeSessions.push(session);
        } catch (error) {
          console.error("Error parsing session data:", error);
          await redis.del(key);
        }
      }
    }

    return activeSessions;
  }
}

export const adminAuthService = new AdminAuthService();
