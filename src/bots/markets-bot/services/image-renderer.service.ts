import axios from "axios";
import { config } from "../../../utils/config";

/**
 * Converts HTML to image buffer using the renderer microservice.
 * Calls POST /render/image which returns binary image data.
 */
export async function generateImageBuffer(
  html: string,
  retries = 5,
  delay = 2000
): Promise<Buffer> {
  if (!config.services.pdfRendererUrl) {
    throw new Error("PDF_RENDERER_URL is not configured");
  }

  for (let i = 0; i < retries; i++) {
    try {
      // POST /render/image with HTML and options.type = "png"
      const { data } = await axios.post(
        `${config.services.pdfRendererUrl}/render/image`,
        {
          html,
          options: {
            type: "png",
          },
        },
        {
          headers: { "Content-Type": "application/json" },
          responseType: "arraybuffer",
          timeout: 60000, // Increased timeout to 60 seconds
        }
      );
      return Buffer.from(data);
    } catch (error: any) {
      const isRetryable =
        error.code === "ETIMEDOUT" ||
        error.code === "ECONNRESET" ||
        error.code === "ENOTFOUND" ||
        error.code === "ECONNREFUSED" ||
        (error.response &&
          (error.response.status === 502 ||
            error.response.status === 503 ||
            error.response.status === 504 ||
            (error.response.status >= 500 && error.response.status < 600)));

      if (isRetryable && i < retries - 1) {
        console.warn(
          `⚠️ Converter server call failed (attempt ${
            i + 1
          }/${retries}). Retrying in ${delay / 1000}s...`,
          error.response?.status || error.code || error.message
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      } else {
        // Log the full error for debugging
        if (error.response) {
          console.error(
            `❌ Converter server error: ${error.response.status} ${error.response.statusText}`
          );
        } else {
          console.error(
            `❌ Converter server error:`,
            error.code || error.message || error
          );
        }
        throw error;
      }
    }
  }

  throw new Error("Max retries reached for converter server call.");
}
