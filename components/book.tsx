"use client";

/* The open diary: two facing pages — the hand-drawn month index on the
   left, the day's sheet on the right — with a real page-turn between
   days: the sheet you leave lifts, flips across the gutter and lets go,
   while the page you asked for is already there beneath it. Little tabs
   on the outer edges turn one page at a time; arrow keys do the same. */

import { useCallback, useEffect, useRef, useState, type TouchEvent } from "react";
import type { DiaryApi } from "@/lib/use-diary";
import type { PageData, MediaItem } from "@/lib/db";
import { shiftDay } from "@/lib/dates";
import { CalendarPage } from "./calendar-page";
import { Sheet } from "./sheet";
import { Lightbox } from "./lightbox";

const TURN_MS = 380;
/* When the new writing is revealed: the sheet we're letting go of has to
   carry the turn far enough first — otherwise the next day's words show
   up before the page has finished turning. */
const REVEAL_NEXT = 0.6; // the sheet has swung clear of the page
const REVEAL_PREV = 0.94; // the index sweeps across it — revealed at the end */

function isPhone(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 767px)").matches
  );
}

type TurnDir = "next" | "prev";

type TurnInfo = {
  dir: TurnDir;
  to: string;
  from: string;
  fromMonth: string;
  fromPage: PageData | undefined;
  fromPageCount: number;
  locked: boolean;
};

const noop = () => {};
const noopFiles = async () => [];

export function Book({
  api,
  editing,
  onRequestEdit,
  onLock,
}: {
  api: DiaryApi;
  editing: boolean;
  onRequestEdit: () => void;
  onLock: () => void;
}) {
  const [view, setView] = useState<{ item: MediaItem; url: string } | null>(null);
  const [turn, setTurn] = useState<TurnInfo | null>(null);
  const [mobileAnim, setMobileAnim] = useState("");
  // the pen lives up here: while it's in hand, a swipe must turn no page
  const [pen, setPen] = useState(false);
  // phones show one page at a time: the writing, or the month index
  const [phoneView, setPhoneView] = useState<"sheet" | "index">("sheet");
  const turningRef = useRef(false);
  const fallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // the page the turn is heading to — swapped in when the sheet has gone
  const swapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingIsoRef = useRef<string | null>(null);
  const selectRef = useRef(api.selectDate);
  selectRef.current = api.selectDate;
  const lastDirRef = useRef<TurnDir>("next");
  const viewRef = useRef(view);
  viewRef.current = view;
  const locked = !editing;

  function navTo(iso: string, dir: TurnDir) {
    if (turningRef.current || !api.ready || iso === api.selectedDate) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
    lastDirRef.current = dir;
    turningRef.current = true;
    setTurn({
      dir,
      to: iso,
      from: api.selectedDate,
      fromMonth: api.month,
      fromPage: api.pages[api.selectedDate],
      fromPageCount: api.pageCount,
      locked,
    });
    // the destination does not pop into the spread: the sheet we're
    // leaving carries the turn first, and the new writing is revealed
    // underneath it (phones slide the sheet in — they swap right away)
    if (swapTimerRef.current) clearTimeout(swapTimerRef.current);
    pendingIsoRef.current = iso;
    if (isPhone()) {
      pendingIsoRef.current = null;
      api.selectDate(iso);
    } else {
      const at = dir === "next" ? TURN_MS * REVEAL_NEXT : TURN_MS * REVEAL_PREV;
      swapTimerRef.current = setTimeout(() => {
        swapTimerRef.current = null;
        pendingIsoRef.current = null;
        api.selectDate(iso);
      }, at);
    }
    if (fallbackRef.current) clearTimeout(fallbackRef.current);
    fallbackRef.current = setTimeout(finishTurn, TURN_MS + 240);
  }

  const finishTurn = useCallback(() => {
    if (fallbackRef.current) {
      clearTimeout(fallbackRef.current);
      fallbackRef.current = null;
    }
    // if the turn ended early, the page still has to arrive
    if (swapTimerRef.current) {
      clearTimeout(swapTimerRef.current);
      swapTimerRef.current = null;
    }
    const pending = pendingIsoRef.current;
    if (pending) {
      pendingIsoRef.current = null;
      selectRef.current(pending);
    }
    turningRef.current = false;
    setTurn(null);
  }, []);

  // on phones (no single-page-turn overlay) the new sheet slides in —
  // key on dates so calendar-only remounts don't replay it
  useEffect(() => {
    if (!api.ready) return;
    setMobileAnim(`sheet-in-${lastDirRef.current}`);
  }, [api.ready, api.selectedDate]);

  // arrow keys turn one page; typing fields keep the keys to themselves
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable]")) return;
      if (viewRef.current) return;
      if (document.querySelector("[data-edit-gate]")) return;
      e.preventDefault();
      const delta = e.key === "ArrowLeft" ? -1 : 1;
      navTo(shiftDay(api.selectedDate, delta), delta < 0 ? "prev" : "next");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ctrl+z (cmd+z on a mac) takes back the last thing done to the page
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() !== "z" || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      // in a text field, the browser's own undo is the better one
      if (t?.closest("input, textarea, select, [contenteditable]")) return;
      if (document.querySelector("[data-edit-gate]")) return;
      e.preventDefault();
      api.undoLast(api.selectedDate);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [api]);

  const page = api.pages[api.selectedDate];

  /* swipe a page the way the thumb means it: a mostly-horizontal drag
     across the paper turns the page, scrolling stays untouched */
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  function onTouchStart(e: TouchEvent<HTMLDivElement>) {
    if (e.touches.length !== 1) {
      touchRef.current = null;
      return;
    }
    touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  function onTouchEnd(e: TouchEvent<HTMLDivElement>) {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start || turningRef.current || !api.ready || viewRef.current) return;
    // the pen is drawing — a swipe here is a stroke, not a page turn
    if (pen) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    navTo(shiftDay(api.selectedDate, dx < 0 ? 1 : -1), dx < 0 ? "next" : "prev");
  }

  return (
    <div>
      {/* phone: pick the page to look at — the writing or the index */}
      <div className="mb-2 flex items-center justify-center gap-2 md:hidden">
        <button
          type="button"
          onClick={() => setPhoneView("sheet")}
          aria-pressed={phoneView === "sheet"}
          className={`press rounded-sm border px-3 py-1 font-note text-[1rem] leading-tight outline-none ${
            phoneView === "sheet"
              ? "border-red-ink/60 text-red-ink"
              : "border-pencil/40 text-pencil"
          }`}
        >
          ✎ the page
        </button>
        <button
          type="button"
          onClick={() => setPhoneView("index")}
          aria-pressed={phoneView === "index"}
          className={`press rounded-sm border px-3 py-1 font-note text-[1rem] leading-tight outline-none ${
            phoneView === "index"
              ? "border-red-ink/60 text-red-ink"
              : "border-pencil/40 text-pencil"
          }`}
        >
          📖 the index
        </button>
      </div>

    <div
      className="book relative grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-0"
      role="region"
      aria-label="Open diary pages"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* outer-edge tabs — one page at a time */}
      <button
        type="button"
        onClick={() => navTo(shiftDay(api.selectedDate, -1), "prev")}
        className="page-nav page-nav-l outline-none"
        aria-label="Flip one page back — previous day"
        title="one page back"
      >
        ‹
      </button>
      <button
        type="button"
        onClick={() => navTo(shiftDay(api.selectedDate, 1), "next")}
        className="page-nav page-nav-r outline-none"
        aria-label="Flip one page forward — next day"
        title="one page forward"
      >
        ›
      </button>

      {/* left page — the index */}
      <div className={`page page-l paper-dots relative overflow-hidden ${phoneView === "sheet" ? "phone-hide" : ""}`}>
        <CalendarPage
          pages={api.pages}
          month={api.month}
          selectedDate={api.selectedDate}
          pageCount={api.writtenTotal}
          recent={api.recent}
          onSelect={(iso) => {
            // chosen from the index — back to the writing
            setPhoneView("sheet");
            navTo(iso, iso > api.selectedDate ? "next" : "prev");
          }}
          onShift={api.setMonth}
        />
      </div>

      {/* right page — this day's sheet */}
      <div className={`page page-r paper-dots relative overflow-hidden ${phoneView === "index" ? "phone-hide" : ""}`}>
        {api.lastSavedAt > 0 && (
          <div
            key={api.lastSavedAt}
            className="stamp stamp-auto bottom-[calc(var(--rule)*1.2)] left-[var(--margin-x)] z-20"
            role="status"
          >
            saved ✓
          </div>
        )}
        <div key={api.selectedDate} className={mobileAnim}>
          <Sheet
            iso={api.selectedDate}
            page={page}
            pageCount={api.pageCount}
            locked={locked}
            onEditToggle={editing ? onLock : onRequestEdit}
            pen={pen}
            onPenChange={setPen}
            onText={(text) => api.setText(api.selectedDate, text)}
            onTextColor={(color) => api.setTextColor(api.selectedDate, color)}
            onStrokes={(strokes) => api.setStrokes(api.selectedDate, strokes)}
            onUndo={() => api.undoLast(api.selectedDate)}
            canUndo={api.canUndo}
            onDoodle={(doodle) => api.setDoodle(api.selectedDate, doodle)}
            onAddFiles={(files, at, x) => api.addMediaFiles(api.selectedDate, files, at, x)}
            onRemoveMedia={(id) => api.removeMedia(api.selectedDate, id)}
            onPlaceMedia={(id, at, x) => api.placeMedia(api.selectedDate, id, at, x)}
            onCaption={(id, caption) => api.editCaption(api.selectedDate, id, caption)}
            onTearOut={() => api.tearOut(api.selectedDate)}
            onOpenMedia={(item: MediaItem, url: string) => setView({ item, url })}
          />
        </div>
      </div>

      {/* the seam */}
      <div className="gutter hidden md:block" aria-hidden="true" />

      {/* the turning page — the sheet being let go, mid-flip */}
      {turn && (
        <div className={`turn-slot turn-slot-${turn.dir}`} aria-hidden="true">
          {/* the page underneath dims while the sheet is over it */}
          <div className="turn-under" />
          <div
            className="turn-page"
            onAnimationEnd={(e) => {
              if (e.target === e.currentTarget) finishTurn();
            }}
          >
            <div className="turn-face turn-front">
              {turn.dir === "next" ? (
                <Sheet
                  iso={turn.from}
                  page={turn.fromPage}
                  pageCount={turn.fromPageCount}
                  locked={turn.locked}
                  onEditToggle={noop}
                  pen={false}
                  onPenChange={noop}
                  onText={noop}
                  onTextColor={noop}
                  onStrokes={noop}
                  onUndo={noop}
                  canUndo={false}
                  onDoodle={noop}
                  onAddFiles={noopFiles}
                  onRemoveMedia={noop}
                  onPlaceMedia={noop}
                  onCaption={noop}
                  onTearOut={noop}
                  onOpenMedia={noop}
                />
              ) : (
                <CalendarPage
                  pages={api.pages}
                  month={turn.fromMonth}
                  selectedDate={turn.from}
                  pageCount={api.writtenTotal}
                  recent={api.recent}
                  onSelect={noop}
                  onShift={noop}
                />
              )}
            </div>
            <div className="turn-face turn-back" />
          </div>
        </div>
      )}

      {/* big look */}
      <Lightbox item={view?.item ?? null} url={view?.url ?? null} onClose={() => setView(null)} />
    </div>
    </div>
  );
}

