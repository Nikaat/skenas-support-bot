import dotenv from "dotenv";

dotenv.config();

const {
  ALLOWED_ORIGINS,
  TELEGRAM_SUPPORT_BOT_TOKEN,
  TELEGRAM_MARKETS_BOT_TOKEN,
  ADMIN_PHONE_NUMBERS,
  CRYPTO_AUTHORIZED_ADMINS,
  TELEGRAM_BOT_API_KEY,
  PORT,
  REDIS_HOST,
  REDIS_PORT,
  REDIS_PASSWORD,
  SKENAS_API_BASE_URL,
} = process.env;

export const config = {
  telegram: {
    supportBotToken: TELEGRAM_SUPPORT_BOT_TOKEN || "",
    marketsBotToken: TELEGRAM_MARKETS_BOT_TOKEN || "",
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

if (config.admin.phoneNumbers.length === 0) {
  throw new Error(
    "ADMIN_PHONE_NUMBERS is required and must contain at least one phone number"
  );
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
