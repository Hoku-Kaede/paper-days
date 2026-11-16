"use client";

/* The diary's brain. The cloud book (Upstash, via /api/book) is the one
   truth every device shares; IndexedDB is the local mirror that keeps
   writing possible offline and keeps this device's photos/videos home.

   - boot: read the cloud book, merge the device's own pages in (newer
     page wins, page by page), push anything only this device had.
   - writes: autosave to IndexedDB (debounced), the same page travels
     up to the cloud on the same heartbeat.
   - sync: a small poller watches the revision counter; when another
     device wrote, changed pages arrive and merge in.
   - tearing out is undoable, locally and in the cloud. */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type MediaItem,
  type MediaKind,
  type PageData,
  type Settings,
  type Stroke,
  deleteBlob,
  deletePageRecord,
  emptyPage,
  getAllPages,
  getBlob,
  putBlob,
  putPage,
  revokeMediaURL,
} from "./db";
import { newId } from "./rand";
import { markFresh } from "./fresh";
import { clearUnlocked } from "./auth";
import {
  deleteMediaFile,
  fetchBook,
  fetchRev,
  onKeeperRejected,
  pushDelete,
  pushPage,
  pushSettings,
  uploadMediaFile,
} from "./sync";

export function hasContent(p: PageData): boolean {
  return (
    p.text.trim().length > 0 ||
    p.doodle !== null ||
    p.media.length > 0 ||
    (p.strokes?.length ?? 0) > 0
  );
}

export type AddResult =
  | { ok: true }
  | { ok: false; reason: "too-big"; name: string };

export type UndoPayload = { page: PageData };

export type SyncState = "live" | "offline" | "boot";

export type DiaryApi = {
  ready: boolean;
  blobSupport: "idb" | "memory";
  sync: SyncState;
  pages: Record<string, PageData>;
  /** the book's own look: the theme and what's taped on the cover */
  settings: Settings;
  setSettings: (patch: Partial<Settings>) => void;
  /** the keeper's token was refused — the phrase is needed again */
  keyExpired: boolean;
  /** is there anything to take back on this page? */
  canUndo: boolean;
  /** take back the last thing done to this page */
  undoLast: (iso: string) => void;
  selectedDate: string;
  month: string;
  saving: boolean;
  lastSavedAt: number;
  undo: UndoPayload | null;
  recent: Array<PageData>;
  lastWritten: string | null;
  pageCount: number;
  writtenTotal: number;
  selectDate: (iso: string) => void;
  setMonth: (month: string) => void;
  setText: (iso: string, text: string) => void;
  setTextColor: (iso: string, color: string) => void;
  setStrokes: (iso: string, strokes: Stroke[]) => void;
  setDoodle: (iso: string, doodle: string | null) => void;
  addMediaFiles: (
    iso: string,
    files: ArrayLike<File>,
    at?: number,
    x?: number,
  ) => Promise<AddResult[]>;
  removeMedia: (iso: string, mediaId: string) => void;
  placeMedia: (iso: string, mediaId: string, at: number, x: number) => void;
  editCaption: (iso: string, mediaId: string, caption: string) => void;
  tearOut: (iso: string) => void;
  undoTearOut: () => void;
};

const POLL_MS = 2500;

/** pages arriving from the cloud: a vaulted memory (url) or an old
    inline print (src) can be seen by anyone; a stale `missed` flag
    next to a copy is a healed lie — clear it */
async function stampRemoteMedia(p: PageData): Promise<PageData> {
  if (!p.media.some((m) => m.missed && (m.url ?? m.src))) return p;
  return {
    ...p,
    media: p.media.map((m) =>
      m.missed && (m.url ?? m.src) ? { ...m, missed: undefined } : m,
    ),
  };
}

/* helpers kept out of the hook body so they never re-create closures */
export function recentList(pages: Record<string, PageData>): PageData[] {
  const written = Object.values(pages)
    .filter(hasContent)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return written.slice(0, 3);
}
export function lastWrittenOf(pages: Record<string, PageData>): string | null {
  const written = Object.values(pages).filter(hasContent).map((p) => p.date);
  if (written.length === 0) return null;
  return written.sort()[written.length - 1];
}
export function pageCountOf(pages: Record<string, PageData>, selectedDate: string): number {
  let n = 0;
  for (const key of Object.keys(pages)) {
    if (key < selectedDate && hasContent(pages[key])) n++;
  }
  return n;
}
export function writtenTotalOf(pages: Record<string, PageData>): number {
  let n = 0;
  for (const key of Object.keys(pages)) {
    if (hasContent(pages[key])) n++;
  }
  return n;
}

export function useDiary(): DiaryApi {
  const [ready, setReady] = useState(false);
  const [blobSupport, setBlobSupport] = useState<"idb" | "memory">("idb");
  const [sync, setSync] = useState<SyncState>("live");
  const [pages, setPagesState] = useState<Record<string, PageData>>({});
  const [settings, setSettingsState] = useState<Settings>({});
  // the keeper's token was refused — the phrase must be said again
  const [keyExpired, setKeyExpired] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [month, setMonth] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(0);
  const [undo, setUndo] = useState<UndoPayload | null>(null);

  // synchronous mirror — the one place mutations read "current" data from
  const pagesRef = useRef<Record<string, PageData>>({});
  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  const pendingRef = useRef(new Map<string, PageData>());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cloudTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const undoRef = useRef<UndoPayload | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // the revision this device last saw; the cloud bumps it on every write
  const revRef = useRef(0);
  // memories whose vault upload was already tried this visit — re-tries
  // wait for the next boot, so a big video never uploads in a loop
  const uploadTriedRef = useRef(new Set<string>());
  const syncRef = useRef<SyncState>("live");
  const selectedDateRef = useRef("");
  useEffect(() => {
    selectedDateRef.current = selectedDate;
  }, [selectedDate]);

  const noteSync = useCallback((state: SyncState) => {    if (state !== "offline" && syncRef.current === "boot") return; // stay quiet until boot says
    if (syncRef.current === state) return;
    syncRef.current = state;
    setSync(state);
  }, []);

  /** the book's look — the theme and the cover's photo, shared by every device */
  const setSettings = useCallback((patch: Partial<Settings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch };
      void pushSettings(next);
      return next;
    });
  }, []);

  // when the server turns the token away, the keeper says the phrase again
  useEffect(() => {
    onKeeperRejected(() => {
      clearUnlocked();
      setKeyExpired(true);
    });
  }, []);

  /** send one page up to the cloud, tracking revisions + reachability */
  const sendUp = useCallback(
    (page: PageData) => {
      void pushPage(page).then((rev) => {
        if (rev != null) {
          revRef.current = rev;
          noteSync("live");
        } else {
          noteSync("offline");
        }
      });
    },
    [noteSync],
  );

  /* ---------- local autosave ---------- */

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    if (pending.size === 0) return;
    pendingRef.current = new Map();
    setSaving(true);
    void (async () => {
      for (const page of pending.values()) {
        await putPage(page);
      }
      setSaving(false);
      setLastSavedAt(Date.now());
    })();
  }, []);

  const schedule = useCallback(
    (page: PageData) => {
      pendingRef.current.set(page.date, page);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => flush(), 600);
    },
    [flush],
  );

  // the cloud copy rides the same heartbeat as the local autosave
  const scheduleCloud = useCallback(
    (page: PageData) => {
      const t = cloudTimersRef.current.get(page.date);
      if (t) clearTimeout(t);
      cloudTimersRef.current.set(
        page.date,
        setTimeout(() => {
          cloudTimersRef.current.delete(page.date);
          const now = pagesRef.current[page.date] ?? page;
          sendUp(now);
        }, 650),
      );
    },
    [sendUp],
  );

  const commit = useCallback(
    (page: PageData, persist: "debounced" | "sync") => {
      pagesRef.current = { ...pagesRef.current, [page.date]: page };
      setPagesState((prev) => ({ ...prev, [page.date]: page }));
      if (persist === "sync") void putPage(page);
      else schedule(page);
      scheduleCloud(page);
    },
    [schedule, scheduleCloud],
  );

  /* ---------- taking things back ---------- */

  /** the book: one page's worth of what came before, per day */
  const undoStackRef = useRef(new Map<string, PageData[]>());
  const lastTextUndoRef = useRef(0);
  const [undoTick, setUndoTick] = useState(0);

  /** remember a page as it was, so it can be taken back */
  const pushUndo = useCallback((iso: string, before: PageData, text = false) => {
    const stack = undoStackRef.current.get(iso) ?? [];
    const now = Date.now();
    if (text && now - lastTextUndoRef.current < 2000 && stack.length > 0) {
      // one burst of typing is one thing to undo
      lastTextUndoRef.current = now;
      return;
    }
    stack.push(before);
    if (stack.length > 50) stack.shift();
    undoStackRef.current.set(iso, stack);
    lastTextUndoRef.current = now;
    setUndoTick((t) => t + 1);
  }, []);

  /** take back the last thing done to this page */
  const undoLast = useCallback(
    (iso: string) => {
      const stack = undoStackRef.current.get(iso);
      if (!stack || stack.length === 0) return;
      const before = stack.pop()!;
      undoStackRef.current.set(iso, stack);
      commit({ ...before, updatedAt: Date.now() }, "sync");
      setUndoTick((t) => t + 1);
    },
    [commit],
  );

  const canUndo = (() => {
    void undoTick; // re-read when the stack changes
    const stack = undoStackRef.current.get(selectedDate);
    return Boolean(stack && stack.length > 0);
  })();

  /** file one memory in the vault (browser → Blob, straight there),
      then tape its URL into the page. No-op when it's already filed,
      already tried, or this shelf doesn't hold the original. */
  const tryUpload = useCallback(
    (iso: string, mediaId: string) => {
      if (uploadTriedRef.current.has(mediaId)) return;
      const base = pagesRef.current[iso];
      const item = base?.media.find((m) => m.id === mediaId);
      if (!item) return;
      void (async () => {
        const blob = await getBlob(mediaId);
        if (!blob || blob.size === 0) return;
        uploadTriedRef.current.add(mediaId);
        const url = await uploadMediaFile(item, blob);
        // only immortalize an upload that succeeded — a lost one can try again on the next visit
        if (!url) {
          uploadTriedRef.current.delete(mediaId);
          return;
        }
        const now = pagesRef.current[iso];
        const target = now?.media.find((m) => m.id === mediaId);
        if (!target) return; // un-taped while flying up
        commit(
          {
            ...now,
            media: now.media.map((m) => (m.id === mediaId ? { ...m, url } : m)),
            updatedAt: Date.now(),
          },
          "sync",
        );
      })();
    },
    [commit],
  );

  /* ---------- boot: cloud book first, merge this device in ---------- */

  useEffect(() => {
    let alive = true;
    void (async () => {
      const local = await getAllPages();
      const localRecord: Record<string, PageData> = {};
      for (const row of local) localRecord[row.date] = row;

      const book = await fetchBook();
      if (!alive) return;

      const merged: Record<string, PageData> = {};
      const seen = new Set<string>();
      const toPush: PageData[] = [];
      if (book) {
        revRef.current = book.rev;
        setSettingsState((prev) =>
          JSON.stringify(prev) === JSON.stringify(book.settings ?? {})
            ? prev
            : (book.settings ?? {}),
        );
        for (const iso of new Set([
          ...Object.keys(book.pages),
          ...Object.keys(localRecord),
        ])) {
          const remote = book.pages[iso];
          const mine = localRecord[iso];
          // a page the cloud already holds — same truth everywhere
          seen.add(iso);
          if (mine && !remote) {
            merged[iso] = mine;
            if (hasContent(mine)) toPush.push(mine);
          } else if (remote && !mine) {
            if (hasContent(remote)) merged[iso] = await stampRemoteMedia(remote);
          } else if (remote && mine) {
            merged[iso] =
              mine.updatedAt >= remote.updatedAt
                ? mine
                : await stampRemoteMedia(remote);
            if (mine.updatedAt > remote.updatedAt && hasContent(mine)) toPush.push(mine);
          } else if (mine) {
            merged[iso] = mine;
          }
        }
        noteSync("live");
      } else {
        for (const iso of Object.keys(localRecord)) merged[iso] = localRecord[iso];
        noteSync("offline"); // can't reach the book — writing stays here till it's back
      }

      pagesRef.current = merged;
      setPagesState(merged);

      // memories this shelf still holds only as loose blobs — every visit,
      // quietly give each its vault copy (the attempt memory keeps it
      // to one shot per memory per visit)
      for (const p of Object.values(merged)) {
        for (const m of p.media) {
          if (!m.url) tryUpload(p.date, m.id);
        }
      }

      const today = new Date();
      const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      setSelectedDate(iso);
      setMonth(iso.slice(0, 7));
      if (typeof indexedDB === "undefined") setBlobSupport("memory");
      setReady(true);

      if (book) {
        seenRef.current = seen;
        for (const p of toPush) sendUp(p);
      }
    })();
    return () => {
      alive = false;
    };
  }, [noteSync, sendUp, tryUpload]);

  /** dates the cloud is known to hold — its silence on one means deletion */
  const seenRef = useRef(new Set<string>());

  const selectDate = useCallback(
    (iso: string) => {
      setSelectedDate(iso);
      setMonth(iso.slice(0, 7));
      flush();
    },
    [flush],
  );

  const setText = useCallback(
    (iso: string, text: string) => {
      const before = pagesRef.current[iso];
      if (before) pushUndo(iso, before, true);
      commit(
        { ...pagesRef.current[iso] ?? emptyPage(iso), text, updatedAt: Date.now() },
        "debounced",
      );
    },
    [commit, pushUndo],
  );

  /** the colour the writing on this page is in */
  const setTextColor = useCallback(
    (iso: string, color: string) => {
      const before = pagesRef.current[iso];
      if (before) pushUndo(iso, before);
      commit(
        {
          ...pagesRef.current[iso] ?? emptyPage(iso),
          textColor: color,
          updatedAt: Date.now(),
        },
        "sync",
      );
    },
    [commit, pushUndo],
  );

  const setStrokes = useCallback(    (iso: string, strokes: Stroke[]) => {
      const before = pagesRef.current[iso];
      if (before) pushUndo(iso, before);
      commit(
        {
          ...pagesRef.current[iso] ?? emptyPage(iso),
          strokes,
          updatedAt: Date.now(),
        },
        "sync",
      );
    },
    [commit, pushUndo],
  );

  const setDoodle = useCallback(
    (iso: string, doodle: string | null) => {
      const before = pagesRef.current[iso];
      if (before) pushUndo(iso, before);
      commit(
        { ...pagesRef.current[iso] ?? emptyPage(iso), doodle, updatedAt: Date.now() },
        "debounced",
      );
    },
    [commit, pushUndo],
  );

  const editCaption = useCallback(
    (iso: string, mediaId: string, caption: string) => {
      const base = pagesRef.current[iso];
      if (!base) return;
      pushUndo(iso, base, true);
      commit(
        {
          ...base,
          media: base.media.map((m) => (m.id === mediaId ? { ...m, caption } : m)),
          updatedAt: Date.now(),
        },
        "debounced",
      );
    },
    [commit, pushUndo],
  );

  const addMediaFiles = useCallback(
    async (
      iso: string,
      files: ArrayLike<File>,
      at?: number,
      x?: number,
    ): Promise<AddResult[]> => {
      const results: AddResult[] = [];
      const added: MediaItem[] = [];
      for (const file of Array.from(files)) {
        const kind: MediaKind = file.type.startsWith("video")
          ? "video"
          : file.type.startsWith("audio")
            ? "audio"
            : "photo";
        if (
          !file.type.startsWith("video") &&
          !file.type.startsWith("image") &&
          !file.type.startsWith("audio")
        ) {
          continue;
        }
        if (file.size > 250 * 1024 * 1024) {
          results.push({ ok: false, reason: "too-big", name: file.name });
          continue;
        }
        const id = newId();
        await putBlob(id, file);
        added.push({
          id,
          kind,
          name: file.name,
          caption: "",
          createdAt: Date.now(),
          // it lands where the hand dropped it, and stays there
          ...(typeof at === "number" ? { at } : {}),
          ...(typeof x === "number" ? { x } : {}),
        });
        markFresh(id); // it gets one little "developing" fade as it lands
        results.push({ ok: true });
      }
      if (added.length > 0) {
        const base = pagesRef.current[iso] ?? emptyPage(iso);
        pushUndo(iso, base);
        commit(
          { ...base, media: [...base.media, ...added], updatedAt: Date.now() },
          "sync", // the blob is already on disk; persist immediately, no debounce
        );
        setLastSavedAt(Date.now());
        // each memory goes straight to the vault in the background — the
        // page shows it right away, other devices follow when it lands
        for (const m of added) tryUpload(iso, m.id);
      }
      return results;
    },
    [commit, tryUpload],
  );

  const removeMedia = useCallback(
    (iso: string, mediaId: string) => {
      const base = pagesRef.current[iso];
      if (!base) return;
      const gone = base.media.find((m) => m.id === mediaId);
      pushUndo(iso, base);
      commit(
        { ...base, media: base.media.filter((m) => m.id !== mediaId), updatedAt: Date.now() },
        "sync",
      );
      void deleteBlob(mediaId).then(() => revokeMediaURL(mediaId));
      // and out of the vault — nothing holds onto the file anymore
      if (gone?.url) void deleteMediaFile(gone.url);
    },
    [commit],
  );

  // the hand puts a memory where it wants it — a line and a spot across
  const placeMedia = useCallback(
    (iso: string, mediaId: string, at: number, x: number) => {
      const base = pagesRef.current[iso];
      if (!base) return;
      pushUndo(iso, base);
      commit(
        {
          ...base,
          media: base.media.map((m) =>
            m.id === mediaId
              ? { ...m, at: Math.max(0, at), x: Math.max(0, Math.min(1, x)) }
              : m,
          ),
          updatedAt: Date.now(),
        },
        "sync",
      );
    },
    [commit, pushUndo],
  );

  const undoTearOut = useCallback(() => {
    const payload = undoRef.current;
    if (payload) {
      const page = payload.page;
      void putPage(page);
      pagesRef.current = { ...pagesRef.current, [page.date]: page };
      setPagesState((prev) => ({ ...prev, [page.date]: page }));
      sendUp(page);
      pendingRef.current.delete(page.date);
    }
    undoRef.current = null;
    setUndo(null);
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  }, [sendUp]);

  const tearOut = useCallback(
    (iso: string) => {
      // never let a queued autosave resurrect the torn page
      pendingRef.current.delete(iso);
      const ct = cloudTimersRef.current.get(iso);
      if (ct) {
        clearTimeout(ct);
        cloudTimersRef.current.delete(iso);
      }
      flush();

      const page = pagesRef.current[iso];
      if (!page) return;
      void deletePageRecord(iso);
      seenRef.current.delete(iso);
      void pushDelete(iso).then((rev) => {
        if (rev != null) {
          revRef.current = rev;
          noteSync("live");
        } else {
          noteSync("offline");
        }
      });
      const next = { ...pagesRef.current };
      delete next[iso];
      pagesRef.current = next;
      setPagesState(next);

      const payload: UndoPayload = { page };
      undoRef.current = payload;
      setUndo(payload);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      undoTimerRef.current = setTimeout(() => {
        const current = undoRef.current;
        if (current) {
          for (const m of current.page.media) {
            void deleteBlob(m.id).then(() => revokeMediaURL(m.id));
            if (m.url) void deleteMediaFile(m.url);
          }
        }
        undoRef.current = null;
        setUndo(null);
      }, 7000);
    },
    [flush, noteSync],
  );

  /* ---------- the quiet listener: other devices' writes arrive here ---------- */

  useEffect(() => {
    if (!ready) return undefined;
    let stopped = false;

    async function tick() {
      if (document.hidden) return; // stay hushed while the tab sleeps
      const rev = await fetchRev();
      if (rev == null) {
        noteSync("offline");
        return;
      }
      if (rev === revRef.current) return;
      const book = await fetchBook();
      if (!book) {
        noteSync("offline");
        return;
      }
      revRef.current = book.rev;
      noteSync("live");
      setSettingsState((prev) =>
        JSON.stringify(prev) === JSON.stringify(book.settings ?? {})
          ? prev
          : (book.settings ?? {}),
      );

      // don't swap text under a hand that's mid-word on that very page
      const activeDate =
        document.activeElement instanceof HTMLTextAreaElement
          ? selectedDateRef.current
          : null;

      const next = { ...pagesRef.current };
      // pages the cloud let go (torn out elsewhere) go here too
      for (const iso of Array.from(seenRef.current)) {
        if (book.pages[iso]) continue;
        const mine = next[iso];
        if (mine) {
          for (const m of mine.media) {
            void deleteBlob(m.id).then(() => revokeMediaURL(m.id));
            if (m.url) void deleteMediaFile(m.url);
          }
        }
        delete next[iso];
        void deletePageRecord(iso);
      }
      // then adopt what changed
      for (const iso of Object.keys(book.pages)) {
        const remote = book.pages[iso];
        seenRef.current.add(iso);
        if (!hasContent(remote)) {
          const mine = next[iso];
          // my copy is at least as fresh as the cloud's empty one — I may
          // have just cleared it, or clicked a free line on a blank page;
          // keep it rather than snapping the sheet away under the pen
          if (mine && mine.updatedAt >= remote.updatedAt) continue;
          if (mine) {
            for (const m of mine.media) {
              void deleteBlob(m.id).then(() => revokeMediaURL(m.id));
              if (m.url) void deleteMediaFile(m.url);
            }
          }
          delete next[iso];
          void deletePageRecord(iso);
          continue;
        }
        const mine = next[iso];
        if (!mine || remote.updatedAt >= mine.updatedAt) {
          if (iso !== activeDate) {
            next[iso] = await stampRemoteMedia(remote);
            // memories marked `missed` somewhere — this shelf may well
            // hold the original and can give the vault its copy
            for (const m of remote.media) {
              if (!m.url) tryUpload(iso, m.id);
            }
          }
        }
      }
      pagesRef.current = next;
      setPagesState(next);
    }

    const interval = setInterval(() => void tick(), POLL_MS);
    const onVis = () => {
      if (!document.hidden) void tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stopped = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [ready, noteSync, tryUpload]);

  return {
    ready,
    blobSupport,
    sync,
    pages,
    settings,
    setSettings,
    keyExpired,
    selectedDate,
    month,
    saving,
    lastSavedAt,
    undo,
    undoLast,
    canUndo,
    recent: recentList(pages),
    lastWritten: lastWrittenOf(pages),
    pageCount: pageCountOf(pages, selectedDate),
    writtenTotal: writtenTotalOf(pages),
    selectDate,
    setMonth,
    setText,
    setTextColor,
    setStrokes,
    setDoodle,
    addMediaFiles,
    removeMedia,
    placeMedia,
    editCaption,
    tearOut,
    undoTearOut,
  };
}

export type { PageData, MediaItem };



