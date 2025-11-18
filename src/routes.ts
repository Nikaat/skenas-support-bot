import { Router } from "express";
import { botController } from "./controller";

const router = Router();

router.get("/health", botController.getHealth);
router.get("/bot-status", botController.getBotStatus);
router.post("/test-notification", botController.testNotification);
router.get("/admin-phone-numbers", botController.getAdminPhoneNumbers);
router.post("/notify", botController.notify);

export default router;
