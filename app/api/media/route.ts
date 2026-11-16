/* The taped memories' vault: real files (photos AND videos) live in the
   team's Vercel Blob store, so every device sees them the moment they
   land. The browser uploads straight to Blob using a short-lived ticket
   this route prints — nothing heavy queues through the serverless body
   limit.

   POST   — print an upload ticket (the keeper's phrase is checked here,
            server-side, before any ticket is issued)
   DELETE — un-tape a memory for good: remove its file from the vault */

import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { del } from "@vercel/blob";

const MAX_MEDIA_BYTES = 250 * 1024 * 1024; // one taped memory, not a hard drive
const TOKEN_PREFIX = "pd:keeper:";

const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
  "video/ogg",
  "video/mp2t",
  "video/x-matroska",
  "video/3gpp",
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/x-m4a",
  "audio/aac",
  "application/octet-stream", // telephones sometimes name things honestly
];

async function tokenIsValid(request: Request): Promise<boolean> {
  const token = (request.headers.get("x-keeper-token") ?? "").trim();
  if (!token) return false;
  const url = process.env.KV_REST_API_URL?.replace(/\/$/, "");
  const kvToken = process.env.KV_REST_API_TOKEN;
  if (!url || !kvToken) return false;
  try {
    const res = await fetch(`${url}/get/${encodeURIComponent(TOKEN_PREFIX + token)}`, {
      headers: { Authorization: `Bearer ${kvToken}` },
    });
    if (!res.ok) return false;
    const j = (await res.json()) as { result?: string };
    return j.result === "1";
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!(await tokenIsValid(request))) {
    return Response.json({ error: "no-key" }, { status: 401 });
  }

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return Response.json({ error: "bad-json" }, { status: 400 });
  }

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ALLOWED_CONTENT_TYPES,
        maximumSizeInBytes: MAX_MEDIA_BYTES,
        // the media id in the pathname is already one-of-a-kind
        addRandomSuffix: false,
        // pictures hang on the wall for a good while
        cacheControlMaxAge: 60 * 60 * 24 * 365,
      }),
    });
    return Response.json(json);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  if (!(await tokenIsValid(request))) {
    return Response.json({ error: "no-key" }, { status: 401 });
  }

  let body: { url?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "bad-json" }, { status: 400 });
  }
  if (typeof body.url !== "string" || !/^https?:\/\//.test(body.url)) {
    return Response.json({ error: "bad-url" }, { status: 400 });
  }

  try {
    await del(body.url);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

