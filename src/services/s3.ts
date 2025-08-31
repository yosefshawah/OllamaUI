import {
  S3Client,
  PutObjectCommand,
  ObjectCannedACL,
} from "@aws-sdk/client-s3";

export interface UploadResult {
  bucket: string;
  key: string;
  url: string;
}

function getEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

const s3Client = new S3Client({
  region: getEnv("S3_REGION", process.env.AWS_REGION),
  credentials: process.env.AWS_ACCESS_KEY_ID
    ? {
        accessKeyId: getEnv("AWS_ACCESS_KEY_ID"),
        secretAccessKey: getEnv("AWS_SECRET_ACCESS_KEY"),
      }
    : undefined,
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
});

export function buildImageKey(params: {
  chatId: string;
  originalFilename?: string;
  extensionFallback?: string;
}): string {
  const { chatId, originalFilename, extensionFallback = "jpg" } = params;
  const safeChatId = chatId.replace(/[^a-zA-Z0-9_-]/g, "-");
  const timestamp = Date.now();
  const providedExt = originalFilename?.includes(".")
    ? originalFilename.split(".").pop()
    : undefined;
  const ext = (providedExt || extensionFallback).toLowerCase();

  const rawBaseName = originalFilename
    ? originalFilename.slice(0, originalFilename.lastIndexOf(".")) ||
      originalFilename
    : "image";
  const safeBaseName = rawBaseName
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-");

  // Save to chats/{chatId}/original/{originalName}-{timestamp}.{ext}
  return `chats/${safeChatId}/original/${safeBaseName}-${timestamp}.${ext}`;
}

export async function uploadImageBufferToS3(params: {
  bucket?: string;
  key: string;
  contentType: string;
  buffer: Buffer | Uint8Array | ArrayBuffer;
  cacheControl?: string;
}): Promise<UploadResult> {
  const bucket = params.bucket ?? getEnv("S3_BUCKET");
  const body =
    params.buffer instanceof ArrayBuffer
      ? new Uint8Array(params.buffer)
      : params.buffer;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: params.key,
      Body: body,
      ContentType: params.contentType,
      CacheControl:
        params.cacheControl ?? "public, max-age=31536000, immutable",
      ...(process.env.S3_ACL
        ? { ACL: process.env.S3_ACL as ObjectCannedACL }
        : {}),
    })
  );

  const publicBase = process.env.S3_PUBLIC_BASE_URL;
  const url = publicBase
    ? `${publicBase.replace(/\/$/, "")}/${params.key}`
    : `https://${bucket}.s3.${getEnv(
        "S3_REGION",
        process.env.AWS_REGION
      )}.amazonaws.com/${params.key}`;

  return { bucket, key: params.key, url };
}
