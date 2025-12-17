import { Telegraf, Context } from "telegraf";
import { config } from "../../../utils/config";
import { marketsService } from "../services/markets.service";
import redis from "../../../utils/redis";

export class TelegramMarketsBot {
  private bot: Telegraf<Context>;
  private isRunning: boolean = false;
  private marketsChannelId: string;
  private officialChannelId: string;

  // Schedulers
  private marketsIntervalId: NodeJS.Timeout | null = null;
  private officialIntervalId: NodeJS.Timeout | null = null;

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
          `⏰ <b>Frequency:</b> 1:30 PM daily\n\n` +
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

  private async getLastOfficialSent(): Promise<Date | null> {
    try {
      const timestamp = await redis.get("lastOfficialSent");
      return timestamp ? new Date(parseInt(timestamp)) : null;
    } catch (error) {
      console.error("❌ Error getting lastOfficialSent from Redis:", error);
      return null;
    }
  }

  private async setLastOfficialSent(date: Date): Promise<void> {
    try {
      await redis.set("lastOfficialSent", date.getTime().toString());
    } catch (error) {
      console.error("❌ Error setting lastOfficialSent in Redis:", error);
    }
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
        `📢 Official channel: ${this.officialChannelId} (1:30 PM daily)`
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
      // Get current time in Iran timezone
      const now = new Date();
      const iranTime = new Date(
        now.toLocaleString("en-US", { timeZone: "Asia/Tehran" })
      );
      const hour = iranTime.getHours();
      const minute = iranTime.getMinutes();

      // Check if it's the scheduled time (1:30 PM) in Iran time
      const isScheduledTime = hour === 13 && minute === 30;

      // Get last sent time from Redis
      const lastOfficialSent = await this.getLastOfficialSent();

      // Check if we haven't sent to this channel today
      const shouldSend =
        isScheduledTime &&
        (!lastOfficialSent || this.isDifferentDay(now, lastOfficialSent));

      if (shouldSend) {
        const marketData = await marketsService.fetchMarketData();
        if (marketData) {
          const message = this.formatMarketDataMessage(marketData);
          await this.sendMessageToChannel(this.officialChannelId, message);
          await this.setLastOfficialSent(now);
          console.log(
            `✅ Market data sent to official channel at 13:30 Iran time`
          );
        }
      }
    } catch (error) {
      console.error("❌ Error checking/sending to official channel:", error);
    }
  }

  private isDifferentDay(date1: Date, date2: Date): boolean {
    const d1 = new Date(
      date1.toLocaleString("en-US", { timeZone: "Asia/Tehran" })
    );
    const d2 = new Date(
      date2.toLocaleString("en-US", { timeZone: "Asia/Tehran" })
    );
    return (
      d1.getFullYear() !== d2.getFullYear() ||
      d1.getMonth() !== d2.getMonth() ||
      d1.getDate() !== d2.getDate()
    );
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
      timeZone: "Asia/Tehran",
    });

    let message = `📅 ${persianDate} | ⏰ ${persianTime}\n\n`;
    message += "‏"; // RTL mark to ensure proper right-to-left alignment

    // Currency data with flags
    if (marketData.currency && marketData.currency.length > 0) {
      message += "<b>نرخ ارز</b>\n\n";
      marketData.currency.forEach((asset: any) => {
        const flag = this.getCurrencyFlag(asset.symbol);
        const name = asset.name || asset.fullname || asset.symbol;
        const price = asset.cprice
          ? `${this.formatPrice(
            parseFloat(asset.cprice).toFixed(2)
          )} ${this.formatUnit(asset.unit)}`
          : "N/A";
        const change = this.formatChange(asset.percentageDifferenceValue);
        message += `‏${flag} ${name}: ${price}\n`;
      });
      message += "\n";
    }

    // Gold data
    if (marketData.gold && marketData.gold.length > 0) {
      message += "<b>طلا و نقره</b>\n\n";
      marketData.gold.forEach((asset: any) => {
        // const emoji = this.getGoldEmoji(asset.symbol);
        const name = asset.name || asset.fullname || asset.symbol;
        const price = asset.cprice
          ? `${this.formatPrice(
            parseFloat(asset.cprice).toFixed(2)
          )} ${this.formatUnit(asset.unit)}`
          : "N/A";
        const change = this.formatChange(asset.percentageDifferenceValue);

        // Make name a link if tradable
        const displayName = asset.tradable
          ? `<a href="${config.skenas.baseUrl}/investment/gold-silver/${asset.symbol}">${name}</a>`
          : name;

        message += `‏ 💰 ${displayName}: ${price}\n`;
      });
      message += "\n";
    }

    // Crypto data
    if (marketData.crypto && marketData.crypto.length > 0) {
      message += "<b>ارز دیجیتال</b>\n\n";
      marketData.crypto.forEach((asset: any) => {
        // const emoji = this.getCryptoEmoji(asset.symbol);
        const name = asset.name || asset.fullname || asset.symbol;
        const price = asset.cprice
          ? `${this.formatPrice(asset.cprice)} ${this.formatUnit(asset.unit)}`
          : "N/A";
        const change = this.formatChange(asset.percentageDifferenceValue);

        // Make name a link if tradable
        const displayName = asset.tradable
          ? `<a href="${config.skenas.baseUrl
          }/investment/cryptocurrency/${asset.symbol.toLowerCase()}">${name}</a>`
          : name;

        message += `‏ 🔸 ${displayName}: ${price}\n`;
      });
    }

    // Add footer link
    message += "\n\n";
    message += `<a href="${config.skenas.baseUrl}">✨ شروع سرمایه‌گذاری از ۱۰۰٬۰۰۰ تومان  تنها در اسکناس</a>`;
    message += `\n\n <b>📲 دانلود اپلیکیشن از:</b>`;
    message += `\n <a href="https://cafebazaar.ir/app/?id=com.project.android.skenas&ref=share">کافه بازار</a> | <a href="https://myket.ir/app/com.project.android.skenas">مایکت</a> | <a href="https://app.skenas.io/home">نسخه وب‌اپ</a>`;
    message += `\n\n <a href="https://t.me/skenasapp">💬 پشتیبانی ۲۴ ساعته و دریافت مشاوره سرمایه‌گذاری آنلاین</a>`;
    message += `\n\n🔗 @skenasio`;
    message += `\n<a href="https://skenas.io">🌐 https://skenas.io</a>`;
    message += `\n☎ ۰۲۱۹۱۰۷۹۱۳۷`;


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

  private formatPrice(value: string | number): string {
    if (value === null || value === undefined || value === "") return "";

    const stringValue = value.toString();
    const parts = stringValue.split(".");

    // Format integer part with thousand separators
    const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");

    // Return with decimal part if exists, otherwise just integer part
    if (parts.length > 1) {
      // Remove trailing zeros from decimal part
      const decimalPart = parts[1].replace(/0+$/, "");
      return decimalPart ? `${integerPart}.${decimalPart}` : integerPart;
    }
    return integerPart;
  }

  private formatUnit(unit: string): string {
    if (unit === "IRR") {
      return "تومان";
    } else if (unit == "USD") {
      return "دلار";
    }
    return unit;
  }

  private formatChange(change: string): string {
    if (!change) return "";

    // Extract percentage value and direction
    const match = change.match(/([+-]?\d+\.?\d*)/);
    if (!match) return change;

    const value = parseFloat(match[1]);
    const isPositive = value >= 0;
    const direction = isPositive ? "🔺" : "🔻";
    const sign = isPositive ? "+" : "-";

    return `(${Math.abs(value).toFixed(1)}${sign}%${direction})`;
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
