export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // Destructure request data
  const { data } = await req.json();

  let message = "Please provide an image for object detection.";

  // Check if there are images for object detection
  if (data?.images && data.images.length > 0) {
    try {
      // Handle object detection for the first image
      const imageUrl = data.images[0];

      // Convert data URL to blob for upload
      const response = await fetch(imageUrl);
      const blob = await response.blob();

      // Create FormData for the prediction API
      const formData = new FormData();
      formData.append("file", blob, "image.jpg");

      // Resolve YOLO service URL (env or fallback)
      const yoloService = process.env.YOLO_SERVICE || "localhost:8080";
      const yoloBase = yoloService.startsWith("http")
        ? yoloService
        : `http://${yoloService}`;
      const predictUrl = `${yoloBase.replace(/\/$/, "")}/predict`;

      // Call the object detection API
      const predictionResponse = await fetch(predictUrl, {
        method: "POST",
        body: formData,
      });

      if (!predictionResponse.ok) {
        throw new Error(`Prediction API error: ${predictionResponse.status}`);
      }

      const predictionResult = await predictionResponse.json();

      // Format the detection results for chat
      message = `🔍 **Object Detection Results**

**Detection Count:** ${predictionResult.detection_count}
**Detected Objects:** ${predictionResult.labels.join(", ")}
**Prediction ID:** ${predictionResult.prediction_uid}

I've analyzed your image and detected ${
        predictionResult.detection_count
      } object(s). The detected objects include: ${predictionResult.labels.join(
        ", "
      )}.`;
    } catch (error) {
      console.error("Object detection error:", error);
      message = `❌ **Object Detection Error**

Sorry, I encountered an error while processing your image: ${
        error instanceof Error ? error.message : "Unknown error"
      }

Please make sure the object detection service is reachable at ${
        process.env.YOLO_SERVICE || "localhost:8080"
      } and that the /predict endpoint is accepting POST requests.`;
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
