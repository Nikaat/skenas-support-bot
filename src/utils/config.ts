import dotenv from "dotenv";

dotenv.config();

const {
  ALLOWED_ORIGINS,
  TELEGRAM_SUPPORT_BOT_TOKEN,
  TELEGRAM_MARKETS_BOT_TOKEN,
  TELEGRAM_NOTIF_BOT_TOKEN,
  TELEGRAM_AUTH_BOT_TOKEN,
  TELEGRAM_MARKETS_CHANNEL_ID,
  TELEGRAM_MARKETS_IMAGE_CHANNEL_ID,
  TELEGRAM_OFFICIAL_CHANNEL_ID,
  ADMIN_PHONE_NUMBERS,
  CRYPTO_AUTHORIZED_ADMINS,
  TELEGRAM_BOT_API_KEY,
  PORT,
  REDIS_HOST,
  REDIS_PORT,
  REDIS_PASSWORD,
  SKENAS_API_BASE_URL,
  SKENAS_BASE_URL,
  PDF_RENDERER_URL,
} = process.env;

export const config = {
  telegram: {
    supportBotToken: TELEGRAM_SUPPORT_BOT_TOKEN || "",
    marketsBotToken: TELEGRAM_MARKETS_BOT_TOKEN || "",
    notifBotToken: TELEGRAM_NOTIF_BOT_TOKEN || "",
    authBotToken: TELEGRAM_AUTH_BOT_TOKEN || "",
    marketsChannelId: TELEGRAM_MARKETS_CHANNEL_ID || "",
    marketsImageChannelId: TELEGRAM_MARKETS_IMAGE_CHANNEL_ID || "",
    officialChannelId: TELEGRAM_OFFICIAL_CHANNEL_ID || "",
  },
  admin: {
    phoneNumbers: ADMIN_PHONE_NUMBERS
      ? ADMIN_PHONE_NUMBERS.split(",").map((p) => p.trim())
      : [],
    cryptoAuthorizedAdmins: CRYPTO_AUTHORIZED_ADMINS
      ? CRYPTO_AUTHORIZED_ADMINS.split(",").map((p) => p.trim())
      : [],
  },
  bot: {
    port: Number(PORT) || 3001,
    apiKey: TELEGRAM_BOT_API_KEY || "",
  },
  redis: {
    host: REDIS_HOST || "localhost",
    port: Number(REDIS_PORT) || 6379,
    password: REDIS_PASSWORD || "",
  },
  skenas: {
    apiBaseUrl: SKENAS_API_BASE_URL || "",
    baseUrl: SKENAS_BASE_URL || "",
  },
  services: {
    pdfRendererUrl: PDF_RENDERER_URL || "",
  },
  allowedOrigins: ALLOWED_ORIGINS || "",
};

// Validation
if (!config.telegram.supportBotToken) {
  throw new Error("TELEGRAM_SUPPORT_BOT_TOKEN is required");
}

if (!config.telegram.marketsBotToken) {
  throw new Error("TELEGRAM_MARKETS_BOT_TOKEN is required");
}

if (!config.telegram.notifBotToken) {
  throw new Error("TELEGRAM_NOTIF_BOT_TOKEN is required");
}

if (!config.telegram.authBotToken) {
  throw new Error("TELEGRAM_AUTH_BOT_TOKEN is required");
}

if (!config.telegram.marketsChannelId) {
  throw new Error("TELEGRAM_MARKETS_CHANNEL_ID is required");
}

if (!config.telegram.officialChannelId) {
  throw new Error("TELEGRAM_OFFICIAL_CHANNEL_ID is required");
}

if (config.admin.phoneNumbers.length === 0) {
  throw new Error(
    "ADMIN_PHONE_NUMBERS is required and must contain at least one phone number"
  );
}

if (!config.skenas.baseUrl) {
  throw new Error("SKENAS_BASE_URL is required");
}

if (config.admin.cryptoAuthorizedAdmins.length === 0) {
  throw new Error(
    "CRYPTO_AUTHORIZED_ADMINS is required and must contain at least one phone number"
  );
}

if (!config.bot.apiKey) {
  throw new Error("TELEGRAM_BOT_API_KEY is required for secure communication");
}

if (!ALLOWED_ORIGINS) {
  throw new Error("ALLOWED_ORIGINS is required");
}

if (!config.bot.port) {
  throw new Error("PORT is required");
}

if (!config.bot.apiKey) {
  throw new Error("TELEGRAM_BOT_API_KEY is required for secure communication");
}

if (!config.redis.host) {
  throw new Error("REDIS_HOST is required");
}

if (!config.redis.port) {
  throw new Error("REDIS_PORT is required");
}

if (!config.redis.password) {
  throw new Error("REDIS_PASSWORD is required");
}
