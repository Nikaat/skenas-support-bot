import redis from "../../utils/redis";
import { INotificationData } from "../../enums/support-bot-enums";

// Conversation kinds for notif-bot
export type PendingNotifSendOne = {
  kind: "notif_send_one";
  step:
    | "await_user_id"
    | "await_title"
    | "await_body"
    | "await_url_choice"
    | "await_url"
    | "await_tag_choice"
    | "await_tag"
    | "await_image_choice"
    | "await_image";
  data: Partial<INotificationData> & { userId?: string };
};

export type PendingNotifBroadcast = {
  kind: "notif_broadcast";
  step:
    | "await_title"
    | "await_body"
    | "await_url_choice"
    | "await_url"
    | "await_tag_choice"
    | "await_tag"
    | "await_image_choice"
    | "await_image";
  data: Partial<INotificationData>;
};

export type PendingNotifAction = PendingNotifSendOne | PendingNotifBroadcast;

class PendingNotifService {
  private readonly key = (chatId: string) => `notif_pending:${chatId}`;
  private readonly ttlSeconds = 15 * 60; // 15 minutes

  async set(chatId: string, action: PendingNotifAction): Promise<void> {
    await redis.set(
      this.key(chatId),
      JSON.stringify(action),
      "EX",
      this.ttlSeconds
    );
  }

  async get(chatId: string): Promise<PendingNotifAction | null> {
    const raw = await redis.get(this.key(chatId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as PendingNotifAction;
    } catch {
      await this.clear(chatId);
      return null;
    }
  }

  async clear(chatId: string): Promise<void> {
    await redis.del(this.key(chatId));
  }
}

export const pendingNotifService = new PendingNotifService();
