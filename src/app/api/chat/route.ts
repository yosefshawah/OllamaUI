export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { enqueueYoloJob } from "@/lib/rabbitmq";
import { randomUUID } from "crypto";

export async function POST(req: Request) {
  // Destructure request data
  const { data } = await req.json();

  let message = "Please provide an image for object detection.";

  // Check if there are images for object detection
  if (data?.images && data.images.length > 0) {
    try {
      // Handle object detection for the first image
      const imageUrl = data.images[0];
      const chatId: string | undefined = data.chatId;
      const filenames: string[] | undefined = Array.isArray(data.filenames)
        ? data.filenames
        : undefined;

      // Parse base64 data URL -> Buffer and content type
      const dataUrlMatch = imageUrl.match(/^data:(.*?);base64,(.*)$/);
      if (!dataUrlMatch) {
        throw new Error("Invalid image data URL format");
      }
      const contentType = dataUrlMatch[1] || "image/jpeg";
      const base64Payload = dataUrlMatch[2];
      const buffer = Buffer.from(base64Payload, "base64");

      // Lazy import to avoid edge bundling issues and keep type isolation
      const { buildImageKey, uploadImageBufferToS3 } = await import(
        "@/services/s3"
      );

      const extensionFromType = contentType.split("/")[1] || "jpg";
      const originalNameFromClient = filenames?.[0];
      const key = buildImageKey({
        chatId: chatId || "unknown-chat",
        originalFilename:
          originalNameFromClient || `image.${extensionFromType}`,
        extensionFallback: extensionFromType,
      });

      // Upload to S3 first
      const upload = await uploadImageBufferToS3({
        key,
        contentType,
        buffer,
      });

      // Generate a prediction UID and enqueue job to RabbitMQ for YOLO worker
      const predictionUid = randomUUID();
      const baseUrl =
        process.env.OLLAMA_UI_PUBLIC_URL || "http://localhost:3000/";
      const callbackUrl = `${baseUrl.replace(/\/$/, "")}/api/yolo/callback`;

      await enqueueYoloJob({
        imgKey: upload.key,
        chatId,
        callbackUrl,
        predictionUid,
      });

      // Inform the user that the job is queued; actual results will arrive via callback
      message = `🕒 Queued object detection job (id: ${predictionUid}). You'll receive results shortly.`;
    } catch (error) {
      console.error("Object detection error:", error);
      message = `❌ **Object Detection Error**

Sorry, I encountered an error while processing your image: ${
        error instanceof Error ? error.message : "Unknown error"
      }

Please make sure the message queue is reachable at ${
        process.env.RABBITMQ_URL || "amqp://localhost:5672"
      } and that the YOLO worker is consuming.`;
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // Split message into lines and send each line as a separate chunk
      const lines = message.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Add newline character back except for the last line
        const content = i < lines.length - 1 ? line + "\n" : line;
        controller.enqueue(encoder.encode(`0:${JSON.stringify(content)}\n`));
      }

      // Send finish event
      controller.enqueue(
        encoder.encode(
          `e:${JSON.stringify({
            finishReason: "stop",
            usage: { promptTokens: 10, completionTokens: message.length },
            isContinued: false,
          })}\n`
        )
      );

      // Send done event
      controller.enqueue(
        encoder.encode(
          `d:${JSON.stringify({
            finishReason: "stop",
            usage: { promptTokens: 10, completionTokens: message.length },
          })}\n`
        )
      );

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Vercel-AI-Data-Stream": "v1",
    },
  });
}
