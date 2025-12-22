import axios from "axios";
import { config } from "../../../utils/config";

/**
 * Converts HTML to image buffer using the renderer microservice.
 * Calls POST /render/image which returns binary image data.
 */
export async function generateImageBuffer(html: string): Promise<Buffer> {
  if (!config.services.pdfRendererUrl) {
    throw new Error("PDF_RENDERER_URL is not configured");
  }

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
      timeout: 45000,
    }
  );
  return Buffer.from(data);
}
