import { config } from "../config/config";
import { IAdminSession } from "../types";

export class AdminAuthService {
  private adminSessions: Map<string, IAdminSession> = new Map();
  private readonly sessionTimeout = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Verify if a phone number belongs to an admin user
   */
  public verifyAdminByPhone(phoneNumber: string): boolean {
    return config.admin.phoneNumbers.includes(phoneNumber);
  }

  /**
   * Create admin session for a chat
   */
  public createAdminSession(phoneNumber: string, chatId: string): void {
    const session: IAdminSession = {
      phoneNumber,
      chatId,
      lastActivity: new Date(),
    };

    this.adminSessions.set(chatId, session);
  }

  /**
   * Get admin session by chat ID
   */
  public getAdminSession(chatId: string): IAdminSession | null {
    const session = this.adminSessions.get(chatId);

    if (!session) {
      return null;
    }

    // Check if session is expired
    const sessionAge = Date.now() - session.lastActivity.getTime();
    if (sessionAge > this.sessionTimeout) {
      this.adminSessions.delete(chatId);
      return null;
    }

    // Update last activity
    session.lastActivity = new Date();
    this.adminSessions.set(chatId, session);

    return session;
  }

  /**
   * Remove admin session (logout)
   */
  public removeAdminSession(chatId: string): boolean {
    return this.adminSessions.delete(chatId);
  }

  /**
   * Clean up expired sessions
   */
  public cleanupExpiredSessions(): number {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [chatId, session] of this.adminSessions.entries()) {
      const sessionAge = now - session.lastActivity.getTime();
      if (sessionAge > this.sessionTimeout) {
        this.adminSessions.delete(chatId);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  /**
   * Get all active admin sessions
   */
  public getActiveAdminSessions(): IAdminSession[] {
    const now = Date.now();
    const activeSessions: IAdminSession[] = [];

    for (const session of this.adminSessions.values()) {
      const sessionAge = now - session.lastActivity.getTime();
      if (sessionAge <= this.sessionTimeout) {
        activeSessions.push(session);
      }
    }

    return activeSessions;
  }
}

export const adminAuthService = new AdminAuthService();
