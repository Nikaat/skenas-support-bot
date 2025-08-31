import dotenv from "dotenv";

dotenv.config();

const {
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_BOT_USERNAME,
  ADMIN_PHONE_NUMBERS,
  TELEGRAM_BOT_API_KEY,
  BOT_PORT,
  NODE_ENV,
} = process.env;

export const config = {
  telegram: {
    botToken: TELEGRAM_BOT_TOKEN || "",
  },
  admin: {
    phoneNumbers: ADMIN_PHONE_NUMBERS
      ? ADMIN_PHONE_NUMBERS.split(",").map((p) => p.trim())
      : [],
  },
  bot: {
    port: Number(BOT_PORT) || 3001,
    nodeEnv: NODE_ENV || "development",
    apiKey: TELEGRAM_BOT_API_KEY || "",
  },
};

// Validation
if (!config.telegram.botToken) {
  throw new Error("TELEGRAM_BOT_TOKEN is required");
}

if (config.admin.phoneNumbers.length === 0) {
  throw new Error(
    "ADMIN_PHONE_NUMBERS is required and must contain at least one phone number"
  );
}

if (!config.bot.apiKey) {
  throw new Error("TELEGRAM_BOT_API_KEY is required for secure communication");
}
