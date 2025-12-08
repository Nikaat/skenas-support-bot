import { Router } from "express";
import { botController } from "./controller";
import { authenticateApiKey } from "./utils/auth.middleware";

const router = Router();

router.get("/health", botController.getHealth);
router.get("/bot-status", botController.getBotStatus);
router.post(
  "/test-notification",
  authenticateApiKey,
  botController.testNotification
);
router.get("/admin-phone-numbers", botController.getAdminPhoneNumbers);
router.get("/notify", authenticateApiKey, botController.notify);

export default router;
