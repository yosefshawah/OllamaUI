import { describe, it, expect, vi, beforeEach } from "vitest";

// We will import the handler and mock its dependencies
import * as rabbit from "@/lib/rabbitmq";
import { POST as chatPost } from "@/app/api/chat/route";

describe("/api/chat enqueues YOLO job", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.RABBITMQ_URL = "amqp://localhost:5672";
    process.env.OLLAMA_UI_PUBLIC_URL = "http://localhost:3000";
    process.env.S3_REGION = "eu-west-1";
    process.env.S3_BUCKET = "dummy";
    vi.restoreAllMocks();
  });

  it("publishes to queue and returns prediction uid header", async () => {
    const enqueueSpy = vi.spyOn(rabbit, "enqueueYoloJob").mockResolvedValue();

    const body = {
      data: {
        images: [
          // 1x1 transparent pixel, valid data URL
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAMAASsJTYQAAAAASUVORK5CYII=",
        ],
        chatId: "test-chat",
        filenames: ["test.png"],
      },
    };

    // Mock S3 upload used inside the route
    const s3 = await import("@/services/s3");
    vi.spyOn(s3, "buildImageKey").mockReturnValue("test-chat/test.png");
    vi.spyOn(s3, "uploadImageBufferToS3").mockResolvedValue({
      key: "test-chat/test.png",
      bucket: "dummy",
      url: "s3://dummy/test-chat/test.png",
    } as any);

    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    const res = await chatPost(req);
    expect(res.status).toBe(200);
    const uid = res.headers.get("X-Prediction-Uid");
    expect(uid).toBeTruthy();
    expect(enqueueSpy).toHaveBeenCalledTimes(1);
    const args = enqueueSpy.mock.calls[0][0];
    expect(args.imgKey).toBe("test-chat/test.png");
    expect(args.callbackUrl).toContain("/api/yolo/callback");
    expect(args.predictionUid).toBe(uid);
  });
});
