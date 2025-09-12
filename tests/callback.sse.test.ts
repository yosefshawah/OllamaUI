import { describe, it, expect, vi, beforeEach } from "vitest";
import { publish, subscribe } from "@/lib/sse-bus";
import { POST as callbackPost } from "@/app/api/yolo/callback/route";

describe("YOLO callback publishes to SSE bus", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("publishes payload to subscribers keyed by prediction_uid", async () => {
    const uid = "unit-test-uid";
    const received: any[] = [];
    const unsubscribe = subscribe(uid, (payload) => {
      received.push(payload);
    });

    const payload = {
      prediction_uid: uid,
      detection_count: 3,
      labels: ["person", "car", "dog"],
    };

    const req = new Request("http://localhost/api/yolo/callback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const res = await callbackPost(req);
    expect(res.status).toBe(200);

    // Allow microtask queue to run subscriber
    await new Promise((r) => setTimeout(r, 0));
    unsubscribe();

    expect(received.length).toBe(1);
    expect(received[0]).toMatchObject(payload);
  });
});
