import * as amqplib from "amqplib";
import type { Channel, Connection, Options } from "amqplib";

type PublishPayload = Record<string, unknown>;

const DEFAULT_URL = process.env.RABBITMQ_URL || "amqp://localhost:5672";
const REQUEST_QUEUE = process.env.YOLO_REQUEST_QUEUE || "yolo.predict";

interface RabbitClient {
  connection: Connection | null;
  channel: Channel | null;
  connect: () => Promise<Channel>;
  publishToRequests: (message: PublishPayload) => Promise<void>;
}

declare global {
  // eslint-disable-next-line no-var
  var __rabbitClient: RabbitClient | undefined;
}

async function createChannel(): Promise<Channel> {
  const connection = await amqplib.connect(DEFAULT_URL);
  const channel: Channel = await connection.createChannel();
  await channel.assertQueue(REQUEST_QUEUE, {
    durable: true,
  } as Options.AssertQueue);
  return channel;
}

async function connect(): Promise<Channel> {
  if (!rabbitClient.channel) {
    const channel = await createChannel();
    rabbitClient.channel = channel;
  }
  return rabbitClient.channel as Channel;
}

async function publishToRequests(message: PublishPayload): Promise<void> {
  const channel = await connect();
  const buffer = Buffer.from(JSON.stringify(message));
  const ok = channel.sendToQueue(REQUEST_QUEUE, buffer, {
    persistent: true,
    contentType: "application/json",
  });
  if (!ok) {
    // Backpressure: wait for drain
    await new Promise<void>((resolve) =>
      channel.once("drain", () => resolve())
    );
  }
}

const rabbitClient: RabbitClient = global.__rabbitClient || {
  connection: null,
  channel: null,
  connect,
  publishToRequests,
};

if (process.env.NODE_ENV !== "production") {
  global.__rabbitClient = rabbitClient;
}

export async function enqueueYoloJob(params: {
  imgKey: string;
  chatId?: string;
  callbackUrl?: string;
  predictionUid: string;
  extras?: Record<string, unknown>;
}): Promise<void> {
  const payload: PublishPayload = {
    type: "yolo_predict",
    img: params.imgKey,
    chat_id: params.chatId,
    callback_url: params.callbackUrl,
    prediction_uid: params.predictionUid,
    ...params.extras,
  };
  await rabbitClient.publishToRequests(payload);
}
