import { Telegraf, Context } from "telegraf";
import { config } from "../../utils/config";
import { marketsService } from "../services/markets.service";

export class TelegramMarketsBot {
  private bot: Telegraf<Context>;
  private isRunning: boolean = false;
  private marketsChannelId: string;
  private officialChannelId: string;

  // Schedulers
  private marketsIntervalId: NodeJS.Timeout | null = null;
  private officialIntervalId: NodeJS.Timeout | null = null;
  private lastOfficialSent: Date | null = null;

  constructor() {
    this.bot = new Telegraf(config.telegram.marketsBotToken);
    this.marketsChannelId = config.telegram.marketsChannelId;
    this.officialChannelId = config.telegram.officialChannelId;
    this.setupCommands();
    this.setupErrorHandling();
  }

  private setupCommands(): void {
    // Status command - for checking bot status
    this.bot.command("status", async (ctx) => {
      try {
        const isRunning = this.isRunning;

        await ctx.reply(
          "🤖 <b>Markets Bot Status</b>\n\n" +
            `📊 <b>Status:</b> ${isRunning ? "🟢 Running" : "🔴 Stopped"}\n\n` +
            `📢 <b>Markets Channel:</b> ${this.marketsChannelId}\n` +
            `⏰ <b>Frequency:</b> Every 3 minutes\n\n` +
            `📢 <b>Official Channel:</b> ${this.officialChannelId}\n` +
            `⏰ <b>Frequency:</b> 9 AM, 3 PM, 9 PM daily\n\n` +
            "This bot automatically sends market data to both channels.",
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

      console.log(`✅ Markets bot started`);
      console.log(
        `📢 Markets channel: ${this.marketsChannelId} (every 3 minutes)`
      );
      console.log(
        `📢 Official channel: ${this.officialChannelId} (9 AM, 3 PM, 9 PM)`
      );

      // Start both schedulers
      this.startMarketsScheduler();
      this.startOfficialScheduler();
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
      if (this.marketsIntervalId) {
        clearInterval(this.marketsIntervalId);
        this.marketsIntervalId = null;
      }

      if (this.officialIntervalId) {
        clearInterval(this.officialIntervalId);
        this.officialIntervalId = null;
      }

      await this.bot.stop();
      this.isRunning = false;
      console.log("✅ Markets bot stopped successfully");
    } catch (error) {
      console.error("❌ Error stopping markets bot:", error);
    }
  }

  private startMarketsScheduler(): void {
    // Fetch data immediately on start
    this.fetchAndSendToMarketsChannel();

    // Then fetch every 3 minutes
    this.marketsIntervalId = setInterval(() => {
      this.fetchAndSendToMarketsChannel();
    }, 3 * 60 * 1000); // 3 minutes in milliseconds
  }

  private startOfficialScheduler(): void {
    // Check every minute if it's time to send to official channel
    this.officialIntervalId = setInterval(() => {
      this.checkAndSendToOfficialChannel();
    }, 60 * 1000); // 1 minute in milliseconds
  }

  private async fetchAndSendToMarketsChannel(): Promise<void> {
    try {
      const marketData = await marketsService.fetchMarketData();

      if (marketData) {
        const message = this.formatMarketDataMessage(marketData);
        await this.sendMessageToChannel(this.marketsChannelId, message);
      }
    } catch (error) {
      console.error(
        "❌ Error fetching/sending market data to markets channel:",
        error
      );
    }
  }

  private async checkAndSendToOfficialChannel(): Promise<void> {
    try {
      const now = new Date();
      const hour = now.getHours();
      const minute = now.getMinutes();

      // Check if it's one of the scheduled times (9 AM, 3 PM, 9 PM)
      const scheduledTimes = [9, 15, 21]; // 9 AM, 3 PM, 9 PM
      const isScheduledTime = scheduledTimes.includes(hour) && minute === 0;

      // Also check if we haven't sent to this channel in the last hour
      const shouldSend =
        isScheduledTime &&
        (!this.lastOfficialSent ||
          now.getTime() - this.lastOfficialSent.getTime() > 60 * 60 * 1000);

      if (shouldSend) {
        const marketData = await marketsService.fetchMarketData();
        if (marketData) {
          const message = this.formatMarketDataMessage(marketData);
          await this.sendMessageToChannel(this.officialChannelId, message);
          this.lastOfficialSent = now;
          console.log(`✅ Market data sent to official channel at ${hour}:00`);
        }
      }
    } catch (error) {
      console.error("❌ Error checking/sending to official channel:", error);
    }
  }

  private formatMarketDataMessage(marketData: any): string {
    // Persian date and time formatting
    const now = new Date();
    const persianDate = now.toLocaleDateString("fa-IR", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const persianTime = now.toLocaleTimeString("fa-IR", {
      hour: "2-digit",
      minute: "2-digit",
    });

    let message = "🌐 <b>به‌روزرسانی لحظه‌ای بازارها</b>\n";
    message += `📅 ${persianDate} | ⏰ ${persianTime}\n\n`;

    // Currency data with flags
    if (marketData.currency && marketData.currency.length > 0) {
      message += "💵 <b>ارز</b>\n\n";
      marketData.currency.forEach((asset: any) => {
        const flag = this.getCurrencyFlag(asset.symbol);
        const name = this.getCurrencyPersianName(asset.symbol);
        const price = asset.cprice
          ? `${asset.cprice.toLocaleString("fa-IR")} تومان`
          : "N/A";
        const change = this.formatChange(asset.percentageDifferenceValue);
        message += `${flag} ${name}: ${price} ${change}\n`;
      });
      message += "\n";
    }

    // Gold data
    if (marketData.gold && marketData.gold.length > 0) {
      message += "💰 <b>طلا</b>\n\n";
      marketData.gold.forEach((asset: any) => {
        const emoji = this.getGoldEmoji(asset.symbol);
        const name = this.getGoldPersianName(asset.symbol);
        const price = asset.cprice
          ? `${asset.cprice.toLocaleString("fa-IR")} ${asset.unit}`
          : "N/A";
        const change = this.formatChange(asset.percentageDifferenceValue);
        message += `${emoji} ${name}: ${price} ${change}\n`;
      });
      message += "\n";
    }

    // Crypto data
    if (marketData.crypto && marketData.crypto.length > 0) {
      message += "💸 <b>ارز دیجیتال</b>\n\n";
      marketData.crypto.forEach((asset: any) => {
        const emoji = this.getCryptoEmoji(asset.symbol);
        const name = this.getCryptoPersianName(asset.symbol);
        const price = asset.cprice
          ? `${asset.cprice.toLocaleString("fa-IR")} ${asset.unit}`
          : "N/A";
        const change = this.formatChange(asset.percentageDifferenceValue);
        message += `${emoji} ${name}: ${price} ${change}\n`;
      });
    }

    return message;
  }

  private getCurrencyFlag(symbol: string): string {
    const flags: { [key: string]: string } = {
      USD: "🇺🇸",
      EUR: "🇪🇺",
      GBP: "🇬🇧",
      AED: "🇦🇪",
      TRY: "🇹🇷",
      CNY: "🇨🇳",
      RUB: "🇷🇺",
      IQD: "🇮🇶",
    };
    return flags[symbol] || "🏳️";
  }

  private getCurrencyPersianName(symbol: string): string {
    const names: { [key: string]: string } = {
      USD: "دلار آمریکا",
      EUR: "یورو",
      GBP: "پوند انگلیس",
      AED: "درهم امارات",
      TRY: "لیر ترکیه",
      CNY: "یوان چین",
      RUB: "روبل روسیه",
      IQD: "صد دینار عراق",
    };
    return names[symbol] || symbol;
  }

  private getGoldEmoji(symbol: string): string {
    const emojis: { [key: string]: string } = {
      GERAMI18: "💎",
      GERAMI24: "💎",
      SEKEE_EMAMI: "💎",
      NIM: "💎",
      ROB: "💎",
      GERAMI: "💎",
      ONS: "🟡",
    };
    return emojis[symbol] || "💎";
  }

  private getGoldPersianName(symbol: string): string {
    const names: { [key: string]: string } = {
      GERAMI18: "گرم طلای ۱۸عیار",
      GERAMI24: "گرم طلای ۲۴عیار",
      SEKEE_EMAMI: "سکه امامی",
      NIM: "نیم سکه",
      ROB: "ربع سکه",
      GERAMI: "سکه گرمی",
      ONS: "انس طلا",
    };
    return names[symbol] || symbol;
  }

  private getCryptoEmoji(symbol: string): string {
    const emojis: { [key: string]: string } = {
      BTC: "🤑",
      ETH: "🤑",
      USDT: "🤑",
      DOGE: "🤑",
      BNB: "🤑",
      SOL: "🤑",
      TRX: "🤑",
      XRP: "🤑",
      SHIB: "🤑",
      DOT: "🤑",
      LTC: "🟡",
      CAKE: "🟡",
    };
    return emojis[symbol] || "🟡";
  }

  private getCryptoPersianName(symbol: string): string {
    const names: { [key: string]: string } = {
      BTC: "بیتکوین",
      ETH: "اتریوم",
      USDT: "تتر",
      DOGE: "دوج کوین",
      BNB: "بایننس کوین",
      SOL: "سولانا",
      TRX: "ترون",
      XRP: "ریپل",
      SHIB: "شیبا اینو",
      DOT: "دات",
      LTC: "لایت‌کوین",
      CAKE: "پنکیک سوآپ",
    };
    return names[symbol] || symbol;
  }

  private formatChange(change: string): string {
    if (!change) return "";

    // Extract percentage value and direction
    const match = change.match(/([+-]?\d+\.?\d*)/);
    if (!match) return change;

    const value = parseFloat(match[1]);
    const isPositive = value >= 0;
    const direction = isPositive ? "🔺" : "🔻";

    return `(${Math.abs(value).toFixed(1)}%${direction})`;
  }

  private async sendMessageToChannel(
    channelId: string,
    message: string
  ): Promise<void> {
    try {
      await this.bot.telegram.sendMessage(channelId, message, {
        parse_mode: "HTML",
      });
      console.log(`✅ Market data sent to channel: ${channelId}`);
    } catch (error) {
      console.error(
        `❌ Failed to send message to channel ${channelId}:`,
        error
      );
    }
  }
}

export const telegramMarketsBot = new TelegramMarketsBot();
