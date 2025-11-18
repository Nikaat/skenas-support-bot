import { Request, Response, NextFunction } from "express";
import { config } from "./config";

// Middleware for API key authentication
export const authenticateApiKey = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      success: false,
      error: "Missing or invalid authorization header",
    });
    return;
  }
  const apiKey = authHeader.substring(7);
  if (apiKey !== config.bot.apiKey) {
    res
      .status(403)
      .json({ success: false, error: "Invalid API key - Access denied" });
    return;
  }
  next();
};
