export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    // Minimal validation
    const predictionUid = body?.prediction_uid as string | undefined;
    const chatId = body?.chat_id as string | undefined;
    const labels = body?.labels as string[] | undefined;
    const detectionCount = body?.detection_count as number | undefined;
    const error = body?.error as string | undefined;

    if (!predictionUid) {
      return new Response(
        JSON.stringify({ error: "prediction_uid required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // For now, just log to server console. Later we could broadcast via SSE or websockets.
    console.log("YOLO callback received:", {
      predictionUid,
      chatId,
      detectionCount,
      labels,
      error,
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Callback parse error:", e);
    return new Response(JSON.stringify({ error: "invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
}
