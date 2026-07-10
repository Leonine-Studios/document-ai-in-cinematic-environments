import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { assetSchema, type DaiceAsset } from "@leoninestudios/daice-chain-core";
import type {
  BridgeInboxJob,
  BridgePushMediaRef,
  BridgePushRequest,
  BridgeSessionHeartbeat,
  BridgeSessionStatus,
} from "../src/bridge/extensionBridgeTypes";

/**
 * Dev-only HTTP bridge that lets the Magnific extension push DAICE-Chain
 * assets into whichever editor tab currently has a package open, without
 * either side needing to implement `postMessage`. See ../BRIDGE.md for the
 * full API contract this implements, and ../src/bridge/ for the browser-side
 * half.
 *
 * Registered only via `configureServer` (never during `vite build`), and
 * state lives entirely in memory for the lifetime of the dev server — this
 * mirrors the editor's own "one working package in memory" model and needs
 * no persistence, since a page reload starts a fresh session anyway.
 */
const API_PREFIX = "/api/daice-editor/v1";
const HEARTBEAT_TIMEOUT_MS = 15_000;

interface StoredMedia {
  assetId: string;
  filename: string;
  mimeType: string;
  bytes: Buffer;
}

interface PushJob {
  id: string;
  assets: DaiceAsset[];
  attachTo: string | null;
  media: StoredMedia[];
  createdAt: number;
}

let session: Omit<BridgeSessionStatus, "connected" | "ready"> = {
  sessionId: null,
  hasPackage: false,
  packageId: null,
  packageName: null,
  assetCount: 0,
  lastSeenAt: 0,
};

const inbox: PushJob[] = [];

function isConnected(): boolean {
  return session.sessionId !== null && Date.now() - session.lastSeenAt < HEARTBEAT_TIMEOUT_MS;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(body));
}

async function readRawBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

/** Wraps a Node request (already fully buffered) as a spec-compliant Web Request, purely so we can reuse the platform's own `formData()` parser instead of hand-rolling one. */
function toWebRequest(req: IncomingMessage, rawBody: Buffer): Request {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(key, value);
    else if (Array.isArray(value)) headers.set(key, value.join(", "));
  }
  return new Request(`http://${req.headers.host ?? "localhost"}${req.url ?? "/"}`, {
    method: req.method,
    headers,
    body: rawBody.length > 0 ? new Uint8Array(rawBody) : undefined,
  });
}

interface ParsedPush {
  parsed: Partial<BridgePushRequest>;
  uploadedMedia: Map<string, StoredMedia>;
}

async function parsePushRequest(req: IncomingMessage): Promise<ParsedPush> {
  const contentType = req.headers["content-type"] ?? "";
  const rawBody = await readRawBody(req);

  if (contentType.includes("multipart/form-data")) {
    const form = await toWebRequest(req, rawBody).formData();
    const payloadRaw = form.get("payload");
    const parsed = typeof payloadRaw === "string" ? (JSON.parse(payloadRaw) as Partial<BridgePushRequest>) : {};
    const uploadedMedia = new Map<string, StoredMedia>();
    for (const [key, value] of form.entries()) {
      if (!key.startsWith("media_") || !(value instanceof File)) continue;
      const assetId = key.slice("media_".length);
      uploadedMedia.set(assetId, {
        assetId,
        filename: value.name || assetId,
        mimeType: value.type || "application/octet-stream",
        bytes: Buffer.from(await value.arrayBuffer()),
      });
    }
    return { parsed, uploadedMedia };
  }

  const text = rawBody.toString("utf-8");
  return { parsed: text ? (JSON.parse(text) as Partial<BridgePushRequest>) : {}, uploadedMedia: new Map() };
}

function guessFilenameFromUrl(url: string): string {
  try {
    const base = new URL(url).pathname.split("/").pop();
    return base || "asset";
  } catch {
    return "asset";
  }
}

async function fetchRemoteMedia(ref: BridgePushMediaRef & { url: string }): Promise<StoredMedia> {
  const response = await fetch(ref.url);
  if (!response.ok) throw new Error(`Failed to fetch "${ref.url}" (${response.status})`);
  return {
    assetId: ref.assetId,
    filename: ref.filename || guessFilenameFromUrl(ref.url),
    mimeType: ref.mimeType || response.headers.get("content-type") || "application/octet-stream",
    bytes: Buffer.from(await response.arrayBuffer()),
  };
}

/** `references` is required by the schema but trivial to forget when hand-assembling a fragment, so default it before validating rather than rejecting on a missing empty array. */
function normalizeAssetForValidation(asset: unknown): unknown {
  if (typeof asset !== "object" || asset === null) return asset;
  const record = asset as Record<string, unknown>;
  return { ...record, references: Array.isArray(record.references) ? record.references : [] };
}

export function daiceExtensionBridge(): Plugin {
  return {
    name: "daice-chain-extension-bridge",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith(API_PREFIX)) {
          next();
          return;
        }

        const path = new URL(req.url, "http://localhost").pathname.slice(API_PREFIX.length) || "/";
        const method = req.method ?? "GET";

        if (method === "OPTIONS") {
          res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          });
          res.end();
          return;
        }

        try {
          if (path === "/health" && method === "GET") {
            sendJson(res, 200, { ok: true, service: "daice-editor-bridge", version: 1 });
            return;
          }

          if (path === "/session" && method === "GET") {
            sendJson(res, 200, { ...session, connected: isConnected(), ready: isConnected() && session.hasPackage } satisfies BridgeSessionStatus);
            return;
          }

          if (path === "/session" && method === "POST") {
            const body = JSON.parse((await readRawBody(req)).toString("utf-8") || "{}") as Partial<BridgeSessionHeartbeat>;
            session = {
              sessionId: typeof body.sessionId === "string" ? body.sessionId : session.sessionId,
              hasPackage: Boolean(body.hasPackage),
              packageId: typeof body.packageId === "string" ? body.packageId : null,
              packageName: typeof body.packageName === "string" ? body.packageName : null,
              assetCount: typeof body.assetCount === "number" ? body.assetCount : 0,
              lastSeenAt: Date.now(),
            };
            sendJson(res, 200, { connected: true, ready: session.hasPackage });
            return;
          }

          if (path === "/push" && method === "POST") {
            if (!isConnected() || !session.hasPackage) {
              sendJson(res, 409, { error: "No editor tab with an open package is currently connected." });
              return;
            }

            const { parsed, uploadedMedia } = await parsePushRequest(req);
            const rawAssets = Array.isArray(parsed.assets) ? parsed.assets : [];
            if (rawAssets.length === 0) {
              sendJson(res, 400, { error: "assets must be a non-empty array." });
              return;
            }

            const errors: Array<{ path: string; message: string }> = [];
            const assets: DaiceAsset[] = [];
            rawAssets.forEach((raw, index) => {
              const result = assetSchema.safeParse(normalizeAssetForValidation(raw));
              if (!result.success) {
                for (const issue of result.error.issues) {
                  errors.push({ path: `assets[${index}]${issue.path.length ? "." + issue.path.join(".") : ""}`, message: issue.message });
                }
                return;
              }
              assets.push(result.data as DaiceAsset);
            });
            if (errors.length > 0) {
              sendJson(res, 422, { error: "One or more assets failed validation.", errors });
              return;
            }

            const media: StoredMedia[] = [];
            const mediaErrors: string[] = [];
            for (const ref of parsed.media ?? []) {
              const uploaded = uploadedMedia.get(ref.assetId);
              if (uploaded) {
                media.push(uploaded);
              } else if (ref.url) {
                try {
                  media.push(await fetchRemoteMedia({ ...ref, url: ref.url }));
                } catch (error) {
                  mediaErrors.push((error as Error).message);
                }
              }
            }
            if (mediaErrors.length > 0) {
              sendJson(res, 502, { error: "Failed to fetch one or more media URLs.", details: mediaErrors });
              return;
            }

            const job: PushJob = {
              id: randomUUID(),
              assets,
              attachTo: typeof parsed.attachTo === "string" ? parsed.attachTo : null,
              media,
              createdAt: Date.now(),
            };
            inbox.push(job);
            sendJson(res, 202, { accepted: true, pushId: job.id });
            return;
          }

          if (path === "/inbox" && method === "GET") {
            const jobs: BridgeInboxJob[] = inbox.map((job) => ({
              id: job.id,
              assets: job.assets,
              attachTo: job.attachTo,
              media: job.media.map((m) => ({ assetId: m.assetId, filename: m.filename, mimeType: m.mimeType, byteLength: m.bytes.length })),
              createdAt: job.createdAt,
            }));
            sendJson(res, 200, jobs);
            return;
          }

          const mediaMatch = path.match(/^\/inbox\/([^/]+)\/media\/([^/]+)$/);
          if (mediaMatch && method === "GET") {
            const [, pushId, assetId] = mediaMatch;
            const media = inbox.find((job) => job.id === pushId)?.media.find((m) => m.assetId === assetId);
            if (!media) {
              sendJson(res, 404, { error: "No such push/media." });
              return;
            }
            res.writeHead(200, { "Content-Type": media.mimeType, "Access-Control-Allow-Origin": "*" });
            res.end(media.bytes);
            return;
          }

          const ackMatch = path.match(/^\/inbox\/([^/]+)\/ack$/);
          if (ackMatch && method === "POST") {
            const index = inbox.findIndex((job) => job.id === ackMatch[1]);
            if (index !== -1) inbox.splice(index, 1);
            sendJson(res, 200, { ok: true });
            return;
          }

          sendJson(res, 404, { error: "Not found." });
        } catch (error) {
          sendJson(res, 500, { error: (error as Error).message });
        }
      });
    },
  };
}
