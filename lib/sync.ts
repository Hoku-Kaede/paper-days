"use client";

/* The cloud bridge: one diary, every device, the same paper.
   Reads: fetchBook() once at the desk, fetchRev() every few seconds —
   only a redownload when the revision moved.
   Writes: pushPage / pushDelete attach the keeper's phrase and stamp
   the revision on their way up.

   Media: every taped memory gets filed in the cloud vault (Vercel
   Blob) with a real URL — photos and videos alike travel to every
   device that opens the page, at full size. Old pages still carrying
   a small inline print keep showing it while the vault copy is made. */

import { upload } from "@vercel/blob/client";
import type { MediaItem, PageData, Settings } from "./db";
import { getBlob } from "./db";
import { keeperToken } from "./auth";

export type ServerBook = {
  rev: number;
  savedAt: number;
  pages: Record<string, PageData>;
  settings: Settings;
};

/** one taped memory, up to 250 MB */
const MAX_MEDIA_BYTES = 250 * 1024 * 1024;
/** from this size up the file travels in parts, so a whole family
    video can cross a wobbly connection in one go */
const MULTIPART_FROM = 64 * 1024 * 1024;

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
  "video/x-msvideo": ".avi",
  "video/ogg": ".ogv",
  "video/mp2t": ".ts",
  "video/x-matroska": ".mkv",
  "video/3gpp": ".3gp",
};

function extOf(item: MediaItem, blob: Blob): string {
  const fromName = /\.[a-z0-9]{2,5}$/i.exec(item.name)?.[0];
  return fromName?.toLowerCase() ?? EXT_BY_TYPE[blob.type] ?? ".bin";
}

/** the keeper's token, sent with every write and every upload */
function keeperHeader(): Record<string, string> {
  const token = keeperToken();
  return token ? { "x-keeper-token": token } : {};
}

/** when the server refuses the token, the keeper must say the phrase
    again — this is how the app hears about it */
let onRejected: (() => void) | null = null;
export function onKeeperRejected(fn: () => void): void {
  onRejected = fn;
}

/** file one memory in the vault; returns its public URL (null = no luck) */
export async function uploadMediaFile(
  item: MediaItem,
  blob: Blob,
): Promise<string | null> {
  if (blob.size === 0 || blob.size > MAX_MEDIA_BYTES) return null;
  try {
    const res = await upload(`pd-diary/${item.id}${extOf(item, blob)}`, blob, {
      access: "public",
      handleUploadUrl: "/api/media",
      // the ticket window is where the keeper's token is checked
      headers: keeperHeader(),
      ...(blob.size > MULTIPART_FROM ? { multipart: true } : {}),
    });
    return res.url;
  } catch {
    return null;
  }
}

/** a page that left this shelf: the vault URL says what is viewable
    everywhere; anything without a home yet rides as `missed` */
async function findOrphanMedia(media: MediaItem[]): Promise<MediaItem[]> {
  const out: MediaItem[] = [];
  for (const m of media) {
    if (m.url) {
      // filed and fully healed — an old inline print is no longer needed
      out.push({ ...m, src: undefined, missed: undefined });
      continue;
    }
    if (m.src) {
      out.push({ ...m, missed: undefined }); // the print wins over a stale flag
      continue;
    }
    out.push({ ...m, missed: true }); // nothing to travel with (yet)
  }
  return out;
}

/** one page, ready for the cloud (and for other devices) */
export async function exportPage(page: PageData): Promise<PageData> {
  return { ...page, media: await findOrphanMedia(page.media) };
}

async function post(body: unknown): Promise<Response | null> {
  try {
    const res = await fetch("/api/book", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...keeperHeader() },
      body: JSON.stringify(body),
    });
    // the server says: that token is no good — the phrase is needed again
    if (res.status === 401) onRejected?.();
    return res;
  } catch {
    return null;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    p.then((v) => resolve(v)).catch(() => resolve(null));
    setTimeout(() => resolve(null), ms);
  });
}

/** the whole book from the cloud, or null when unreachable */
export async function fetchBook(): Promise<ServerBook | null> {
  const res = await withTimeout(fetch("/api/book", { cache: "no-store" }), 4000);
  if (!res || !res.ok) return null;
  try {
    const j = (await res.json()) as ServerBook & { error?: string };
    if (!j || typeof j !== "object" || typeof j.pages !== "object" || j.error) return null;
    return {
      rev: Number(j.rev) || 0,
      savedAt: Number(j.savedAt) || 0,
      pages: j.pages,
      settings: (j.settings ?? {}) as Settings,
    };
  } catch {
    return null;
  }
}

/** polling fare: just the revision number */
export async function fetchRev(): Promise<number | null> {
  const res = await withTimeout(fetch("/api/book?rev", { cache: "no-store" }), 2500);
  if (!res || !res.ok) return null;
  try {
    const j = (await res.json()) as { rev?: number };
    return typeof j.rev === "number" ? j.rev : null;
  } catch {
    return null;
  }
}

/** send one page up; returns the revision it created (null = offline) */
export async function pushPage(page: PageData): Promise<number | null> {
  const exported = await exportPage(page);
  const res = await post({ page: exported });
  if (!res || !res.ok) return null;
  try {
    const j = (await res.json()) as { rev?: number };
    return typeof j.rev === "number" ? j.rev : null;
  } catch {
    return null;
  }
}

/** the book's own settings — which cover it wears, what's taped on it */
export async function pushSettings(settings: Settings): Promise<boolean> {
  const res = await post({ settings });
  return Boolean(res && res.ok);
}

/** a torn page leaves the cloud too; returns the revision (or null) */
export async function pushDelete(iso: string): Promise<number | null> {
  const res = await post({ delete: iso });
  if (!res || !res.ok) return null;
  try {
    const j = (await res.json()) as { rev?: number };
    return typeof j.rev === "number" ? j.rev : null;
  } catch {
    return null;
  }
}

/** a memory un-taped anywhere is gone from the vault too */
export async function deleteMediaFile(url: string): Promise<void> {
  try {
    await fetch("/api/media", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...keeperHeader() },
      body: JSON.stringify({ url }),
    });
  } catch {
    /* the vault keeps it; nothing else depends on this */
  }
}

