import { Telegraf, Context } from "telegraf";
import { config } from "../../utils/config";
import { marketsService } from "../services/markets.service";

export class TelegramMarketsBot {
  private bot: Telegraf<Context>;
  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  private channelId: string;

  constructor() {
    this.bot = new Telegraf(config.telegram.marketsBotToken);
    this.channelId = config.telegram.marketsChannelId;
    this.setupCommands();
    this.setupErrorHandling();
  }

  private setupCommands(): void {
    // Status command - for checking bot status
    this.bot.command("status", async (ctx) => {
      try {
        const isRunning = this.isRunning;
        const channelId = this.channelId;

        await ctx.reply(
          "🤖 <b>Markets Bot Status</b>\n\n" +
            `📊 <b>Status:</b> ${isRunning ? "🟢 Running" : "🔴 Stopped"}\n` +
            `📢 <b>Channel:</b> ${channelId}\n` +
            `⏰ <b>Update Frequency:</b> Every 1 minute\n\n` +
            "This bot automatically sends market data to the configured channel.",
          { parse_mode: "HTML" }
        );
      } catch (error) {
        console.error("Error in status command:", error);
        await ctx.reply("❌ An error occurred. Please try again later.");
      }
    });

    // Help command
    this.bot.help((ctx) => {
      ctx.reply(
        "🤖 <b>Markets Bot Commands:</b>\n\n" +
          "/status - Check bot status\n" +
          "/help - Show this help message\n\n" +
          "This bot automatically sends market data to the configured channel every minute.",
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
      return;
    }

    try {
      // Set bot commands
      const botCommands = [
        { command: "status", description: "Check bot status" },
        { command: "help", description: "Show help message" },
      ];

      await this.bot.telegram.setMyCommands(botCommands);
      this.bot.launch();
      this.isRunning = true;

      console.log(
        `✅ Markets bot started and will send data to channel: ${this.channelId}`
      );

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

    // Then fetch every 1 minute
    this.intervalId = setInterval(() => {
      this.fetchAndSendMarketData();
    }, 1 * 60 * 1000); // 1 minute in milliseconds
  }

  private async fetchAndSendMarketData(): Promise<void> {
    try {
      const marketData = await marketsService.fetchMarketData();

      if (marketData) {
        const message = this.formatMarketDataMessage(marketData);

        // Send to the configured channel
        await this.sendMessageToChannel(message);
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

  private async sendMessageToChannel(message: string): Promise<void> {
    try {
      await this.bot.telegram.sendMessage(this.channelId, message, {
        parse_mode: "HTML",
      });
      console.log(`✅ Market data sent to channel: ${this.channelId}`);
    } catch (error) {
      console.error(
        `❌ Failed to send message to channel ${this.channelId}:`,
        error
      );
    }
  }
}

export const telegramMarketsBot = new TelegramMarketsBot();
