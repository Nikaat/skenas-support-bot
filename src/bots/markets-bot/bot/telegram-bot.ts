import { Telegraf, Context } from "telegraf";
import { config } from "../../../utils/config";
import { marketsService } from "../services/markets.service";
import redis from "../../../utils/redis";
import { generateImageBuffer } from "../services/image-renderer.service";
import * as fs from "fs";
import * as path from "path";

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

  private async getLastMarketsImageSent(): Promise<Date | null> {
    try {
      const timestamp = await redis.get("lastMarketsImageSent");
      return timestamp ? new Date(parseInt(timestamp)) : null;
    } catch (error) {
      console.error("❌ Error getting lastMarketsImageSent from Redis:", error);
      return null;
    }
  }

  private async setLastMarketsImageSent(date: Date): Promise<void> {
    try {
      await redis.set("lastMarketsImageSent", date.getTime().toString());
    } catch (error) {
      console.error("❌ Error setting lastMarketsImageSent in Redis:", error);
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
        `📢 Official channel: ${this.officialChannelId} (1:30 PM daily - image)`
      );

      // Start all schedulers
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

    // Then fetch every 3 minutes for text messages
    this.marketsIntervalId = setInterval(() => {
      this.fetchAndSendToMarketsChannel();
    }, 3 * 60 * 1000); // 3 minutes in milliseconds

    // Also check every minute if it's time to send image
    setInterval(() => {
      this.checkAndSendImageToMarketsChannel();
    }, 60 * 1000); // 1 minute in milliseconds
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

  /**
   * Checks if it's time to send image to markets channel
   * Sends at 9AM, 13:30PM, and 21PM (9PM) Iran time
   */
  private async checkAndSendImageToMarketsChannel(): Promise<void> {
    try {
      if (!config.services.pdfRendererUrl) {
        // No renderer service configured – silently skip
        return;
      }

      // Get current time in Iran timezone
      const now = new Date();
      const iranTime = new Date(
        now.toLocaleString("en-US", { timeZone: "Asia/Tehran" })
      );
      const hour = iranTime.getHours();
      const minute = iranTime.getMinutes();

      // Check if it's one of the scheduled times: 9AM, 13:30PM, or 21PM
      const isScheduledTime =
        (hour === 9 && minute === 0) ||
        (hour === 13 && minute === 30) ||
        (hour === 21 && minute === 0);

      if (!isScheduledTime) {
        return;
      }

      // Get last sent time from Redis
      const lastMarketsImageSent = await this.getLastMarketsImageSent();

      // Check if we haven't sent at this specific time today
      const shouldSend =
        !lastMarketsImageSent ||
        this.isDifferentTimeSlot(now, lastMarketsImageSent, hour, minute);

      if (shouldSend) {
        // Fetch fresh market data
        const marketData = await marketsService.fetchMarketData();
        if (!marketData) {
          return;
        }

        // Generate HTML with live data
        const html = this.generateDailyPriceHtml(marketData, now);

        // Convert HTML to image buffer
        const imageBuffer = await generateImageBuffer(html);

        // Generate text message for caption
        const message = this.formatMarketDataMessage(marketData);

        // Send image to markets channel with text message as caption
        await this.bot.telegram.sendPhoto(
          this.marketsChannelId,
          { source: imageBuffer },
          {
            caption: message,
            parse_mode: "HTML",
          } as any
        );

        await this.setLastMarketsImageSent(now);
        console.log(
          `✅ Market price image sent to markets channel at ${hour}:${minute
            .toString()
            .padStart(2, "0")} Iran time`
        );
      }
    } catch (error) {
      console.error(
        "❌ Error checking/sending image to markets channel:",
        error
      );
    }
  }

  /**
   * Helper to check if we've already sent at this time slot today
   */
  private isDifferentTimeSlot(
    date1: Date,
    date2: Date,
    currentHour: number,
    currentMinute: number
  ): boolean {
    const d1 = new Date(
      date1.toLocaleString("en-US", { timeZone: "Asia/Tehran" })
    );
    const d2 = new Date(
      date2.toLocaleString("en-US", { timeZone: "Asia/Tehran" })
    );

    // Check if it's a different day
    if (
      d1.getFullYear() !== d2.getFullYear() ||
      d1.getMonth() !== d2.getMonth() ||
      d1.getDate() !== d2.getDate()
    ) {
      return true;
    }

    // Check if the last sent time was at a different time slot
    const lastHour = d2.getHours();
    const lastMinute = d2.getMinutes();

    // If current time is 9:00, last should not be 9:00
    // If current time is 13:30, last should not be 13:30
    // If current time is 21:00, last should not be 21:00
    return !(lastHour === currentHour && lastMinute === currentMinute);
  }

  /**
   * Helper to load font as base64 from public/fonts directory
   */
  private loadFontBase64(filename: string): string {
    // Resolve path from project root to public/fonts
    // Handle both development (src/) and production (dist/) scenarios
    let projectRoot: string;

    // Try dist/ first (production), then src/ (development)
    const distPath = path.resolve(__dirname, "../../../../");
    const srcPath = path.resolve(__dirname, "../../../../../");

    // Check if we're in dist/ or src/ by looking for public/fonts
    const distFontPath = path.join(distPath, "public/fonts", filename);
    const srcFontPath = path.join(srcPath, "public/fonts", filename);

    let fontPath: string;
    if (fs.existsSync(distFontPath)) {
      fontPath = distFontPath;
    } else if (fs.existsSync(srcFontPath)) {
      fontPath = srcFontPath;
    } else {
      throw new Error(
        `Font file not found: ${filename}. Tried: ${distFontPath} and ${srcFontPath}`
      );
    }

    return fs.readFileSync(fontPath).toString("base64");
  }

  /**
   * Generates @font-face CSS with base64 encoded fonts
   */
  private generateFontFaces(): string {
    const IRANSansX_UltraLight = this.loadFontBase64(
      "IRANSANSXFANUM-ULTRALIGHT.OTF"
    );
    const IRANSansX_Thin = this.loadFontBase64("IRANSANSXFANUM-THIN.OTF");
    const IRANSansX_Light = this.loadFontBase64("IRANSANSXFANUM-LIGHT.OTF");
    const IRANSansX_Regular = this.loadFontBase64("IRANSANSXFANUM-REGULAR.OTF");
    const IRANSansX_Medium = this.loadFontBase64("IRANSANSXFANUM-MEDIUM.OTF");
    const IRANSansX_DemiBold = this.loadFontBase64(
      "IRANSANSXFANUM-DEMIBOLD.OTF"
    );
    const IRANSansX_Bold = this.loadFontBase64("IRANSANSXFANUM-BOLD.OTF");
    const IRANSansX_ExtraBold = this.loadFontBase64(
      "IRANSANSXFANUM-EXTRABOLD.OTF"
    );
    const IRANSansX_Black = this.loadFontBase64("IRANSANSXFANUM-BLACK.OTF");

    return `
    @font-face {
      font-family: 'IRANSansX';
      src: url('data:font/opentype;base64,${IRANSansX_UltraLight}') format('opentype');
      font-weight: 100;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: 'IRANSansX';
      src: url('data:font/opentype;base64,${IRANSansX_Thin}') format('opentype');
      font-weight: 200;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: 'IRANSansX';
      src: url('data:font/opentype;base64,${IRANSansX_Light}') format('opentype');
      font-weight: 300;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: 'IRANSansX';
      src: url('data:font/opentype;base64,${IRANSansX_Regular}') format('opentype');
      font-weight: 400;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: 'IRANSansX';
      src: url('data:font/opentype;base64,${IRANSansX_Medium}') format('opentype');
      font-weight: 500;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: 'IRANSansX';
      src: url('data:font/opentype;base64,${IRANSansX_DemiBold}') format('opentype');
      font-weight: 600;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: 'IRANSansX';
      src: url('data:font/opentype;base64,${IRANSansX_Bold}') format('opentype');
      font-weight: 700;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: 'IRANSansX';
      src: url('data:font/opentype;base64,${IRANSansX_ExtraBold}') format('opentype');
      font-weight: 800;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: 'IRANSansX';
      src: url('data:font/opentype;base64,${IRANSansX_Black}') format('opentype');
      font-weight: 900;
      font-style: normal;
      font-display: swap;
    }`;
  }

  /**
   * Generates HTML template for daily price image with live market data
   */
  private generateDailyPriceHtml(marketData: any, now: Date): string {
    const persianDate = now.toLocaleDateString("fa-IR", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      timeZone: "Asia/Tehran",
    });

    // Extract asset data
    const usd = marketData.currency?.find((a: any) => a.symbol === "USD");
    const btc = marketData.crypto?.find((a: any) => a.symbol === "BTC");
    const gold18 = marketData.gold?.find((a: any) => a.symbol === "GERAM18");
    const fullCoin = marketData.gold?.find(
      (a: any) => a.symbol === "SEKEE_EMAMI"
    );

    // Format values
    const formatPrice = (asset: any): string => {
      if (!asset || !asset.cprice) return "N/A";
      return this.formatPrice(asset.cprice);
    };

    const formatChange = (
      asset: any
    ): { value: string; isPositive: boolean } => {
      if (!asset || !asset.percentageDifferenceValue) {
        return { value: "N/A", isPositive: true };
      }
      const match = asset.percentageDifferenceValue.match(/([+-]?\d+\.?\d*)/);
      if (!match) return { value: "N/A", isPositive: true };
      const value = parseFloat(match[1]);
      return {
        value: `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`,
        isPositive: value >= 0,
      };
    };

    const btcPrice = formatPrice(btc);
    const btcChange = formatChange(btc);
    const usdPrice = formatPrice(usd);
    const usdChange = formatChange(usd);
    const goldPrice = formatPrice(gold18);
    const goldChange = formatChange(gold18);
    const coinPrice = formatPrice(fullCoin);
    const coinChange = formatChange(fullCoin);

    const fontFaces = this.generateFontFaces();

    return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>قیمت لحظه‌ای</title>
  <style>
    ${fontFaces}
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: "IRANSansX", system-ui, -apple-system, BlinkMacSystemFont,
        sans-serif;
      background: linear-gradient(
        to bottom,
        #062746 0,
        #153d46 45%,
        #235245 100%
      );
      display: flex;
      align-items: flex-end;
      justify-content: center;
      width: 2160px;
      height: 2160px;
      margin: 0;
      padding: 0;
      direction: rtl;
      overflow: hidden;
    }
    .card {
      width: 1910px;
      border-radius: 110px 110px 0 0;
      backdrop-filter: blur(100px);
      background: rgba(255, 255, 255, 0.08);
      padding: 30px 30px 55px;
      color: #ffffff;
    }
    .header {
      text-align: center;
      margin: 60px 0;
    }
    .header-title {
      font-size: 110px;
      font-weight: 650;
      margin-bottom: 20px;
    }
    .header-title-small {
      font-size: 65px;
    }
    .header-date {
      display: inline-block;
      padding: 14.4px 80px;
      margin-top: 36px;
      border-radius: 999px;
      font-weight: 400;
      background: rgba(255, 255, 255, 0.08);
      font-size: 40px;
    }
    .grid {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 60px;
      margin-top: 60px;
    }
    .tile {
      background: #ffffff;
      color: #0f172a;
      border-radius: 90px;
      padding: 28.8px 38.4px 38.4px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 24px 72px rgba(15, 23, 42, 0.18);
      width: 750px;
      height: 640px;
    }
    .tile-header {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 100%;
      margin-bottom: 19.2px;
    }
    .icon {
      width: 130px;
      height: 130px;
      border-radius: 999px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      flex-shrink: 0;
      font-size: 43.2px;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 60px;
      margin-top: 30px;
    }
    .icon img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      background-color: #ffffff;
    }
    .icon-btc { background: #f7931a; }
    .icon-usd { background: #1f2933; }
    .icon-gold { background: #eab308; }
    .icon-coin { background: #f59e0b; }
    .tile-title {
      font-size: 70px;
      font-weight: 600;
      text-align: center;
    }
    .tile-subtitle {
      display: none;
    }
    .tile-price {
      font-size: 65px;
      font-weight: 700;
      margin: 14.4px 0;
      display: flex;
      align-items: baseline;
      justify-content: center;
      gap: 9.6px;
      width: 100%;
    }
    .tile-currency {
      font-size: 43.2px;
      color: #6b7280;
      font-weight: 400;
    }
    .tile-change {
      margin-top: 9.6px;
      font-size: 43.2px;
      font-weight: 600;
      text-align: center;
      width: 100%;
    }
    .tile-change.positive { color: #16a34a; }
    .tile-change.negative { color: #dc2626; }

    .footer {
      margin-top: 67.2px;
      text-align: center;
      font-size: 33.6px;
    }
    .brand {
      font-weight: 700;
      font-size: 43.2px;
      margin-bottom: 9.6px;
    }
    .brand img {
      height: auto;
      max-width: 280px;
      width: 280px;
      display: block;
      margin: 0 auto;
    }
    .brand-sub {
      font-size: 28.8px;
      /* font-weight: 150; */
      opacity: 0.85;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="header-title">
        <span class="header-title-small">قیمت لحظه‌ای</span> دلار، بیت‌کوین،
        سکه و طلا
      </div>
      <div class="header-date">
        ${persianDate}
      </div>
    </div>

    <div class="grid">
      <!-- بیت‌کوین -->
      <div class="tile">
        <div class="tile-header">
          <div class="icon icon-btc">
            <img src="${"https://file.skenas.io/market-icons/btc.png"}" alt="بیت‌کوین" />
          </div>
          <div class="tile-title">بیت‌کوین</div>
        </div>
        <div class="tile-price">
          ${btcPrice} <span class="tile-currency">دلار</span>
        </div>
        <div class="tile-change ${
          btcChange.isPositive ? "positive" : "negative"
        }">
          ${btcChange.value}
        </div>
      </div>

      <!-- دلار -->
      <div class="tile">
        <div class="tile-header">
          <div class="icon icon-usd">
            <img src="${"https://file.skenas.io/market-icons/usd.png"}" alt="دلار" />
          </div>
          <div class="tile-title">دلار</div>
        </div>
        <div class="tile-price">
          ${usdPrice} <span class="tile-currency">تومان</span>
        </div>
        <div class="tile-change ${
          usdChange.isPositive ? "positive" : "negative"
        }">
          ${usdChange.value}
        </div>
      </div>
    </div>
    <div class="grid">
      <!-- طلای گرمی (۱۸ عیار) -->
      <div class="tile">
        <div class="tile-header">
          <div class="icon icon-gold">
            <img src="${"https://file.skenas.io/market-icons/gold.png"}" alt="طلای گرمی" />
          </div>
          <div class="tile-title">طلای گرمی (۱۸ عیار)</div>
        </div>
        <div class="tile-price">
          ${goldPrice} <span class="tile-currency">تومان</span>
        </div>
        <div class="tile-change ${
          goldChange.isPositive ? "positive" : "negative"
        }">
          ${goldChange.value}
        </div>
      </div>

      <!-- تمام سکه -->
      <div class="tile">
        <div class="tile-header">
          <div class="icon icon-coin">
            <img src="${"https://file.skenas.io/market-icons/coin.png"}" alt="تمام سکه" />
          </div>
          <div class="tile-title">تمام سکه</div>
        </div>
        <div class="tile-price">
          ${coinPrice} <span class="tile-currency">تومان</span>
        </div>
        <div class="tile-change ${
          coinChange.isPositive ? "positive" : "negative"
        }">
          ${coinChange.value}
        </div>
      </div>
    </div>

    <div class="footer">
      <div class="brand">
        <img src="https://file.skenas.io/market-icons/skenas-white.png" alt="اسکناس" />
      </div>
      <div class="brand-sub">پلتفرم آنلاین سرمایه‌گذاری</div>
    </div>
  </div>
</body>
</html>`;
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

      // Check if it's the scheduled time (2:22 PM) in Iran time
      const isScheduledTime = hour === 14 && minute === 22;

      // Get last sent time from Redis
      const lastOfficialSent = await this.getLastOfficialSent();

      // Check if we haven't sent to this channel today
      const shouldSend =
        isScheduledTime &&
        (!lastOfficialSent || this.isDifferentDay(now, lastOfficialSent));

      if (shouldSend) {
        if (!config.services.pdfRendererUrl) {
          // No renderer service configured – skip
          return;
        }

        const marketData = await marketsService.fetchMarketData();
        if (marketData) {
          // Generate HTML with live data
          const html = this.generateDailyPriceHtml(marketData, now);

          // Convert HTML to image buffer
          const imageBuffer = await generateImageBuffer(html);

          // Generate text message for caption
          const message = this.formatMarketDataMessage(marketData);

          // Send image to official channel with text message as caption
          await this.bot.telegram.sendPhoto(
            this.officialChannelId,
            { source: imageBuffer },
            {
              caption: message,
              parse_mode: "HTML",
            } as any
          );

          await this.setLastOfficialSent(now);
          console.log(
            `✅ Market price image sent to official channel at 13:30 Iran time`
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
      year: "numeric",
      month: "numeric",
      day: "numeric",
    });
    const persianTime = now.toLocaleTimeString("fa-IR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Tehran",
    });

    let message =
      "🔔 اسکناس؛ پلتفرم آنلاین سرمایه‌گذاری با مبالغ خرد و کلان\n\n";
    message += `📅 تاریخ: ${persianDate} | ⏰ ساعت: ${persianTime}\n\n`;
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
          ? `<a href="${
              config.skenas.baseUrl
            }/investment/cryptocurrency/${asset.symbol.toLowerCase()}">${name}</a>`
          : name;

        message += `‏ 🔸 ${displayName}: ${price}\n`;
      });
    }

    // Add footer link
    message += "\n\n";
    message += `✨ شروع سرمایه‌گذاری از ۱۰۰٬۰۰۰ تومان تنها در اسکناس`;
    message += `\n\n <b>📲 دانلود اپلیکیشن از:</b>`;
    message += `\n <a href="https://cafebazaar.ir/app/?id=com.project.android.skenas&ref=share">کافه بازار</a> | <a href="https://myket.ir/app/com.project.android.skenas">مایکت</a> | <a href="https://app.skenas.io/home">نسخه وب‌اپ</a>`;
    message += `\n\n <a href="https://t.me/skenasapp">💬 پشتیبانی ۲۴ساعته و مشاوره سرمایه‌گذاری آنلاین</a>`;
    message += `\n\n🔗 @skenasio`;
    message += `\n<a href="https://skenas.io">🌐 https://skenas.io</a>`;
    message += `\n☎️ ۰۲۱۹۱۰۷۹۱۳۷`;

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
        disable_web_page_preview: true,
      } as any);
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
