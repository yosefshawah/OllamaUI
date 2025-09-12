import { subscribe } from "@/lib/sse-bus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: { id: string } }
) {
  const id = context.params.id;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
        );
      };
      const unsubscribe = subscribe(id, send);

      controller.enqueue(encoder.encode(`retry: 5000\n\n`));
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`:\n\n`));
      }, 15000);

      // @ts-ignore - Request in this runtime has AbortSignal
      request.signal?.addEventListener?.("abort", () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
