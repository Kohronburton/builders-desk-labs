import { isIP } from "node:net";
import { fileTypeFromBuffer } from "file-type";

export interface DownloadPolicy {
  allowedHosts: readonly string[];
  allowedMimeTypes: readonly string[];
  maxBytes: number;
  timeoutMs: number;
}

export interface DownloadedAsset {
  bytes: Buffer;
  detectedContentType: string;
}

function assertSafeSourceUrl(rawUrl: string, allowedHosts: readonly string[]): URL {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") throw new Error("ASSET_SOURCE_NOT_HTTPS");
  if (url.username || url.password) throw new Error("ASSET_SOURCE_CREDENTIALS_FORBIDDEN");
  if (url.port && url.port !== "443") throw new Error("ASSET_SOURCE_PORT_FORBIDDEN");
  const host = url.hostname.toLowerCase();
  if (isIP(host) !== 0) throw new Error("ASSET_SOURCE_IP_LITERAL_FORBIDDEN");
  if (!allowedHosts.includes(host)) throw new Error("ASSET_SOURCE_HOST_NOT_ALLOWED");
  return url;
}

async function readBoundedBody(response: Response, maxBytes: number): Promise<Buffer> {
  if (!response.body) throw new Error("ASSET_SOURCE_EMPTY_BODY");
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new Error("ASSET_TOO_LARGE");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new Error("ASSET_TOO_LARGE");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (total === 0) throw new Error("ASSET_SOURCE_EMPTY_BODY");
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
}

export async function downloadAsset(rawUrl: string, policy: DownloadPolicy): Promise<DownloadedAsset> {
  const url = assertSafeSourceUrl(rawUrl, policy.allowedHosts);
  const response = await fetch(url, {
    method: "GET",
    redirect: "error",
    signal: AbortSignal.timeout(policy.timeoutMs),
    headers: { "user-agent": "Mayne-Asset-Ingest/2" }
  });
  if (!response.ok) throw new Error(`ASSET_SOURCE_HTTP_${response.status}`);

  const bytes = await readBoundedBody(response, policy.maxBytes);
  const detected = await fileTypeFromBuffer(bytes);
  const detectedContentType = detected?.mime ?? "application/octet-stream";
  if (!policy.allowedMimeTypes.includes(detectedContentType)) throw new Error("ASSET_MIME_NOT_ALLOWED");
  return { bytes, detectedContentType };
}
