import dotenv from "dotenv";

dotenv.config();

const {
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_BOT_USERNAME,
  ADMIN_PHONE_NUMBERS,
  SKENAS_API_BASE_URL,
  SKENAS_API_KEY,
  BOT_PORT,
  NODE_ENV,
} = process.env;

export const config = {
  telegram: {
    botToken: TELEGRAM_BOT_TOKEN || "",
    botUsername: TELEGRAM_BOT_USERNAME || "",
  },
  admin: {
    phoneNumbers: ADMIN_PHONE_NUMBERS
      ? ADMIN_PHONE_NUMBERS.split(",").map((p) => p.trim())
      : [],
  },
  skenas: {
    apiBaseUrl: SKENAS_API_BASE_URL || "http://localhost:3000",
    apiKey: SKENAS_API_KEY || "",
  },
  bot: {
    port: Number(BOT_PORT) || 3001,
    nodeEnv: NODE_ENV || "development",
  },
};

// Validation
if (!config.telegram.botToken) {
  throw new Error("TELEGRAM_BOT_TOKEN is required");
}

if (!config.telegram.botUsername) {
  throw new Error("TELEGRAM_BOT_USERNAME is required");
}

if (config.admin.phoneNumbers.length === 0) {
  throw new Error(
    "ADMIN_PHONE_NUMBERS is required and must contain at least one phone number"
  );
}
