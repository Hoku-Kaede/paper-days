/* The diary's memory: IndexedDB, wrapped in promises.
   - store "pages": one row per date, keyed "YYYY-MM-DD" (a diary page IS a date)
   - store "media": one Blob per taped photo/video, keyed by media id
   Falls back to in-memory maps if IndexedDB is unavailable, so writing
   always works; only blobs are lost in that case. */

export type MediaKind = "photo" | "video" | "audio";

/** a freehand mark on the paper */
export type Stroke = {
  id: string;
  /** the pen's colour */
  color: string;
  /** how thick the line is, as a fraction of the sheet's width */
  w: number;
  /** the points, as 0..1 fractions of the sheet — so a mark lands in the
      same spot on every device */
  pts: number[];
  /** a pen line, or a broad translucent highlighter sweep */
  kind?: "pen" | "highlighter";
  /** the brush's texture: smooth paper, watercolour, chalk */
  tex?: "smooth" | "water" | "chalk";
  /** the colour poured inside this shape */
  fill?: string;
};

export type MediaItem = {
  id: string;
  kind: MediaKind;
  name: string;
  caption: string;
  createdAt: number;
  /** the filed original in the cloud vault (Vercel Blob) — one copy,
      every device sees it, photos and videos alike */
  url?: string;
  /** an old inline print (data URL) some pages still carry */
  src?: string;
  /** true when no copy of this memory can travel between devices */
  missed?: boolean;
  /** the line this memory is pinned to — its own, whatever gets written
      around it */
  at?: number;
  /** where across the sheet it sits: 1 = its right edge at the page's
      right edge, 0 = hard against the margin */
  x?: number;
  /** how many card-widths in from the margin */
  col?: number;
};

export type Settings = {
  /** which book it is — the theme of the cover, paper and ink */
  theme?: string;
  /** which hand the book is written in */
  font?: string;
  /** the photo or GIF taped on the cover */
  cover?: MediaItem;
};

export type PageData = {
  date: string; // "YYYY-MM-DD"
  text: string;
  /** the colour the writing on this page is in */
  textColor?: string;
  doodle: string | null;
  media: MediaItem[];
  /** the freehand marks on the paper */
  strokes?: Stroke[];
  updatedAt: number;
};

export function emptyPage(date: string): PageData {
  return {
    date,
    text: "",
    doodle: null,
    media: [],
    updatedAt: Date.now(),
  };
}

const DB_NAME = "paper-days";
const DB_VERSION = 1;
const PAGES = "pages";
const MEDIA = "media";

type MyDatabase = {
  db: IDBDatabase | null;
  memory: { pages: Map<string, PageData>; blobs: Map<string, Blob> };
};

let instance: MyDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("no-idb"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PAGES)) {
        db.createObjectStore(PAGES, { keyPath: "date" });
      }
      if (!db.objectStoreNames.contains(MEDIA)) {
        db.createObjectStore(MEDIA);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("idb-open-failed"));
  });
}

async function connect(): Promise<MyDatabase> {
  if (instance) return instance;
  const mem = {
    pages: new Map<string, PageData>(),
    blobs: new Map<string, Blob>(),
  };
  try {
    const db = await openDB();
    instance = { db, memory: mem };
  } catch {
    instance = { db: null, memory: mem };
  }
  return instance;
}

function put<T>(store: IDBObjectStore, value: T, key?: IDBValidKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = store.put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getAllPages(): Promise<Array<PageData>> {
  const { db, memory } = await connect();
  if (!db) return [...memory.pages.values()];
  const tx = db.transaction(PAGES, "readonly");
  const req = tx.objectStore(PAGES).getAll();
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as Array<PageData>);
    req.onerror = () => reject(req.error);
  });
}

export async function putPage(page: PageData): Promise<void> {
  const { db, memory } = await connect();
  memory.pages.set(page.date, page);
  if (!db) return;
  const tx = db.transaction(PAGES, "readwrite");
  await put(tx.objectStore(PAGES), page);
}

export async function deletePageRecord(date: string): Promise<void> {
  const { db, memory } = await connect();
  memory.pages.delete(date);
  if (!db) return;
  const tx = db.transaction(PAGES, "readwrite");
  await new Promise<void>((resolve, reject) => {
    const req = tx.objectStore(PAGES).delete(date);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function putBlob(id: string, blob: Blob): Promise<void> {
  const { db, memory } = await connect();
  memory.blobs.set(id, blob);
  if (!db) return;
  const tx = db.transaction(MEDIA, "readwrite");
  await put(tx.objectStore(MEDIA), blob, id);
}

export async function getBlob(id: string): Promise<Blob | null> {
  const { db, memory } = await connect();
  if (!db) return memory.blobs.get(id) ?? null;
  const tx = db.transaction(MEDIA, "readonly");
  const req = tx.objectStore(MEDIA).get(id);
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteBlob(id: string): Promise<void> {
  const { db, memory } = await connect();
  memory.blobs.delete(id);
  if (!db) return;
  const tx = db.transaction(MEDIA, "readwrite");
  await new Promise<void>((resolve, reject) => {
    const req = tx.objectStore(MEDIA).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/* ---- object URLs: created lazily, revoked on removal only ---- */
const urlCache = new Map<string, string>();

export async function mediaURL(id: string): Promise<string | null> {
  const cached = urlCache.get(id);
  if (cached) return cached;
  const blob = await getBlob(id);
  if (!blob || blob.size === 0) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return url;
}

export function revokeMediaURL(id: string): void {
  const url = urlCache.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(id);
  }
}
