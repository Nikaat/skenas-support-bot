import { Telegraf, Context } from "telegraf";
import { config } from "../../utils/config";
import { marketsService } from "../../markets-bot/services/markets.service";

export class TelegramMarketsBot {
  private bot: Telegraf<Context>;
  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  private subscribedUsers: Set<number> = new Set();

  constructor() {
    this.bot = new Telegraf(config.telegram.marketsBotToken);
    this.setupCommands();
    this.setupErrorHandling();
  }

  private setupCommands(): void {
    // Start command
    this.bot.start(async (ctx) => {
      try {
        const userId = ctx.from?.id;

        if (!userId) {
          await ctx.reply("❌ Unable to identify user. Please try again.");
          return;
        }

        // Check if user is already subscribed
        if (this.isUserSubscribed(userId)) {
          await ctx.reply(
            "✅ <b>You are already subscribed!</b>\n\n" +
              "You will continue to receive market updates every 5 minutes.\n\n" +
              "Use /logout to unsubscribe from updates.",
            { parse_mode: "HTML" }
          );
          return;
        }

        // Subscribe the user
        this.subscribeUser(userId);

        await ctx.reply(
          "🎉 <b>Welcome to Markets Bot!</b>\n\n" +
            "✅ <b>You are now subscribed to market updates</b>\n\n" +
            "📊 <b>What you'll receive:</b>\n" +
            "• Currency market data (Top 5)\n" +
            "• Cryptocurrency data (Top 5)\n" +
            "• Gold market data (Top 5)\n\n" +
            "⏰ <b>Update frequency:</b> Every 5 minutes\n\n" +
            "💡 <b>Commands:</b>\n" +
            "/logout - Stop receiving updates\n" +
            "/help - Show all commands\n\n" +
            "You will start receiving market data shortly!",
          { parse_mode: "HTML" }
        );

        console.log(`✅ User ${userId} started markets bot subscription`);
      } catch (error) {
        console.error("Error in start command:", error);
        await ctx.reply("❌ An error occurred. Please try again later.");
      }
    });

    // Logout command
    this.bot.command("logout", async (ctx) => {
      try {
        const userId = ctx.from?.id;

        if (!userId) {
          await ctx.reply("❌ Unable to identify user. Please try again.");
          return;
        }

        // Check if user is subscribed
        if (!this.isUserSubscribed(userId)) {
          await ctx.reply(
            "ℹ️ <b>You are not currently subscribed</b>\n\n" +
              "Use /start to begin receiving market updates.",
            { parse_mode: "HTML" }
          );
          return;
        }

        // Unsubscribe the user
        this.unsubscribeUser(userId);

        await ctx.reply(
          "👋 <b>You have been unsubscribed</b>\n\n" +
            "❌ You will no longer receive market updates.\n\n" +
            "💡 Use /start to subscribe again if you change your mind.",
          { parse_mode: "HTML" }
        );

        console.log(`❌ User ${userId} unsubscribed from markets bot`);
      } catch (error) {
        console.error("Error in logout command:", error);
        await ctx.reply("❌ An error occurred. Please try again later.");
      }
    });

    // Help command
    this.bot.help((ctx) => {
      ctx.reply(
        "🤖 <b>Markets Bot Commands:</b>\n\n" +
          "/start - Subscribe to market updates\n" +
          "/logout - Unsubscribe from market updates\n" +
          "/help - Show this help message\n\n" +
          "You will receive market data every 5 minutes for currency, crypto, and gold assets.",
        { parse_mode: "HTML" }
      );
    });
  }

  private setupErrorHandling(): void {
    this.bot.catch((err, ctx) => {
      console.error("Markets bot error:", err);
      ctx.reply("❌ An error occurred. Please try again later.");
    });
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      console.log("Markets bot is already running");
      return;
    }

    try {
      await this.bot.launch();
      this.isRunning = true;
      console.log("✅ Markets bot started successfully");

      // Start the scheduled market data fetching
      this.startMarketDataScheduler();
    } catch (error) {
      console.error("❌ Failed to start markets bot:", error);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }

      await this.bot.stop();
      this.isRunning = false;
      console.log("✅ Markets bot stopped successfully");
    } catch (error) {
      console.error("❌ Error stopping markets bot:", error);
    }
  }

  private startMarketDataScheduler(): void {
    // Fetch data immediately on start
    this.fetchAndSendMarketData();

    // Then fetch every 5 minutes
    this.intervalId = setInterval(() => {
      this.fetchAndSendMarketData();
    }, 5 * 60 * 1000); // 5 minutes in milliseconds
  }

  private async fetchAndSendMarketData(): Promise<void> {
    try {
      console.log("📊 Fetching market data...");
      const marketData = await marketsService.fetchMarketData();

      if (marketData && this.subscribedUsers.size > 0) {
        const message = this.formatMarketDataMessage(marketData);

        // Send to all subscribed users
        const sendPromises = Array.from(this.subscribedUsers).map((userId) =>
          this.sendMessageToUser(userId, message)
        );

        await Promise.allSettled(sendPromises);
        console.log(
          `📤 Market data sent to ${this.subscribedUsers.size} users`
        );
      }
    } catch (error) {
      console.error("❌ Error fetching/sending market data:", error);
    }
  }

  private formatMarketDataMessage(marketData: any): string {
    let message = "📈 <b>Market Data Update</b>\n\n";

    // Add timestamp
    const now = new Date();
    message += `🕐 <b>Time:</b> ${now.toLocaleString("fa-IR")}\n\n`;

    // Currency data
    if (marketData.currency && marketData.currency.length > 0) {
      message += "💱 <b>Currency (Top 5):</b>\n";
      marketData.currency.slice(0, 5).forEach((asset: any, index: number) => {
        const price = asset.cprice
          ? `${asset.cprice.toLocaleString()} ${asset.unit}`
          : "N/A";
        const change = asset.percentageDifferenceValue || "";
        message += `${index + 1}. ${
          asset.name || asset.symbol || "N/A"
        }: ${price} ${change}\n`;
      });
      message += "\n";
    }

    // Crypto data
    if (marketData.crypto && marketData.crypto.length > 0) {
      message += "₿ <b>Crypto (Top 5):</b>\n";
      marketData.crypto.slice(0, 5).forEach((asset: any, index: number) => {
        const price = asset.cprice
          ? `${asset.cprice.toLocaleString()} ${asset.unit}`
          : "N/A";
        const change = asset.percentageDifferenceValue || "";
        message += `${index + 1}. ${
          asset.name || asset.symbol || "N/A"
        }: ${price} ${change}\n`;
      });
      message += "\n";
    }

    // Gold data
    if (marketData.gold && marketData.gold.length > 0) {
      message += "🥇 <b>Gold (Top 5):</b>\n";
      marketData.gold.slice(0, 5).forEach((asset: any, index: number) => {
        const price = asset.cprice
          ? `${asset.cprice.toLocaleString()} ${asset.unit}`
          : "N/A";
        const change = asset.percentageDifferenceValue || "";
        message += `${index + 1}. ${
          asset.name || asset.symbol || "N/A"
        }: ${price} ${change}\n`;
      });
    }

    return message;
  }

  private async sendMessageToUser(
    userId: number,
    message: string
  ): Promise<void> {
    try {
      await this.bot.telegram.sendMessage(userId, message, {
        parse_mode: "HTML",
      });
    } catch (error) {
      console.error(`❌ Failed to send message to user ${userId}:`, error);
      // Remove user from subscribed list if they blocked the bot
      if (
        error instanceof Error &&
        error.message &&
        error.message.includes("blocked")
      ) {
        this.subscribedUsers.delete(userId);
        console.log(`🗑️ Removed blocked user ${userId} from subscriptions`);
      }
    }
  }

  public subscribeUser(userId: number): void {
    this.subscribedUsers.add(userId);
    console.log(`✅ User ${userId} subscribed to market updates`);
  }

  public unsubscribeUser(userId: number): void {
    this.subscribedUsers.delete(userId);
    console.log(`❌ User ${userId} unsubscribed from market updates`);
  }

  public isUserSubscribed(userId: number): boolean {
    return this.subscribedUsers.has(userId);
  }

  public getSubscribedUsersCount(): number {
    return this.subscribedUsers.size;
  }
}

export const telegramMarketsBot = new TelegramMarketsBot();
