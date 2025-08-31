// Simple admin session (in-memory)
export interface IAdminSession {
  phoneNumber: string;
  chatId: string;
  lastActivity: Date;
}
