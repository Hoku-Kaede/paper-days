"use client";

/* The right page: today's sheet. The edit inkwell sits to the left of the
   date, sticker doodles under it, then the ruled writing — every free
   line on the sheet belongs to the pen — and taped-in memories below.
   Everything above the writing area is an exact multiple of --rule, so
   the ink always lands on the lines. Reading is free; writing asks for
   the keeper's phrase (the edit key). */

import { type DragEvent, type MouseEvent, useEffect, useRef, useState } from "react";
import type { PageData, MediaItem, Stroke } from "@/lib/db";
import type { AddResult } from "@/lib/use-diary";
import { hasContent } from "@/lib/use-diary";
import { longDate } from "@/lib/dates";
import { newId, pick, spread, tiltOf } from "@/lib/rand";
import { DOODLE_NAMES, DoodleKey, DOODLES, DOODLE_ART, Squiggle } from "./doodles";
import { MediaCard } from "./media-card";

const TOO_BIG_MS = 4500;

/* the pen's colours — the diary's own inks */
const PEN_COLOURS = [
  { id: "ink", name: "ballpoint blue", hex: "#2a4494" },
  { id: "red", name: "the red pen", hex: "#bb4a3c" },
  { id: "black", name: "black ink", hex: "#241c14" },
  { id: "pencil", name: "graphite pencil", hex: "#82796a" },
  { id: "green", name: "green ink", hex: "#3f7a4a" },
  { id: "violet", name: "violet ink", hex: "#6b4a9e" },
  { id: "pink", name: "pink ink", hex: "#b5467a" },
  { id: "brown", name: "brown ink", hex: "#8a5a2b" },
  { id: "yellow", name: "highlighter yellow", hex: "#f2d27e" },
  { id: "mint", name: "highlighter mint", hex: "#bcd6a8" },
  { id: "sky", name: "highlighter sky", hex: "#a9cbe6" },
];
const PEN_WIDTH = 0.005; // of the sheet's width
const HIGHLIGHT_WIDTH = 0.045; // a broad sweep

/** the brushes — how thick the line is */
const BRUSHES = [
  { id: "fine", name: "a fine nib", mult: 0.55, dot: "h-1.5 w-1.5" },
  { id: "medium", name: "a medium nib", mult: 1, dot: "h-2.5 w-2.5" },
  { id: "broad", name: "a broad nib", mult: 1.9, dot: "h-4 w-4" },
] as const;

/** the textures the brush can carry */
const TEXTURES = [
  { id: "smooth", name: "smooth paper", mult: 1, filter: undefined },
  { id: "water", name: "watercolour", mult: 1.5, filter: "url(#pd-water)" },
  { id: "chalk", name: "dry chalk", mult: 1.2, filter: "url(#pd-chalk)" },
] as const;

const TOOLS = [
  { id: "pen", label: "the pen", icon: "✒" },
  { id: "highlighter", label: "the highlighter", icon: "▬" },
  { id: "eraser", label: "the eraser", icon: "⌫" },
  { id: "fill", label: "the paint pot", icon: "🪣" },
] as const;
type Tool = (typeof TOOLS)[number]["id"];

/* how the taped memories are laid out on the sheet */
const CARD_W_PHOTO = 236; // a photo card plus the tape that overhangs it
const CARD_W_VIDEO = 284;
const GALLERY_MAX = 0.5; // the photos may take at most this much of the sheet
const GALLERY_GAP = 10; // the breathing room between writing and photos
const MIN_TEXT = 120; // the narrowest the writing column may become

export function Sheet({
  iso,
  page,
  pageCount,
  locked,
  onEditToggle,
  pen,
  onPenChange,
  onText,
  onStrokes,
  onTextColor,
  onUndo,
  canUndo,
  onDoodle,
  onAddFiles,
  onRemoveMedia,
  onPlaceMedia,
  onCaption,
  onTearOut,
  onOpenMedia,
}: {
  iso: string;
  page: PageData | undefined;
  pageCount: number;
  /** true while the keeper's phrase isn't in this session — sheet is read-only */
  locked: boolean;
  onEditToggle: () => void;
  /** the pen is in hand (or not) */
  pen: boolean;
  onPenChange: (pen: boolean) => void;
  onText: (text: string) => void;
  onStrokes: (strokes: Stroke[]) => void;
  /** the colour the writing on this page is in */
  onTextColor: (color: string) => void;
  /** take back the last thing done to this page */
  onUndo: () => void;
  canUndo: boolean;
  onDoodle: (doodle: DoodleKey | null) => void;
  onAddFiles: (files: FileList, at?: number, x?: number) => Promise<AddResult[]>;
  onRemoveMedia: (mediaId: string) => void;
  onPlaceMedia: (mediaId: string, at: number, x: number) => void;
  onCaption: (mediaId: string, caption: string) => void;
  onTearOut: () => void;
  onOpenMedia: (item: MediaItem, url: string) => void;
}) {
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const writingRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const pagerRef = useRef<HTMLDivElement | null>(null);
  const [confirmTear, setConfirmTear] = useState(false);
  const [tooBig, setTooBig] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  // the keeper's voice — a note recorded right here
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  // the pen: freehand marks on the paper
  const [tool, setTool] = useState<Tool>("pen");
  const [brush, setBrush] = useState<(typeof BRUSHES)[number]["id"]>("medium");
  const [texture, setTexture] = useState<(typeof TEXTURES)[number]["id"]>("smooth");
  // the colour popover for the typing
  const [writingColours, setWritingColours] = useState(false);
  // the nib & texture popover
  const [brushMenu, setBrushMenu] = useState(false);
  const [penColor, setPenColor] = useState(PEN_COLOURS[0].hex);
  const [live, setLive] = useState<Stroke | null>(null);
  const inkRef = useRef<SVGSVGElement | null>(null);
  const [inkSize, setInkSize] = useState({ w: 0, h: 0 });
  // the fingers on the paper — one draws, two pan the page
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const panRef = useRef<{ x: number; y: number } | null>(null);
  const tooBigTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // every free line on the sheet is writable: measured whole lines for
  // the blank writing area
  const [freeLines, setFreeLines] = useState(0);
  const [rulePx, setRulePx] = useState(0);
  // how wide the writing column is — how many memories fit side by side
  const [columnW, setColumnW] = useState(0);
  // the red margin's width — the gallery starts after it
  const [padLeft, setPadLeft] = useState(0);

  const value = page?.text ?? "";
  const empty = page === undefined || !hasContent(page);
  const hasMedia = (page?.media.length ?? 0) > 0;
  // the memory being dragged around the sheet, if any
  const draggingIdRef = useRef<string | null>(null);

  /** the cards shrink a little when the sheet is too narrow for them */
  function cardScaleOf(): number {
    if (!page?.media.length) return 1;
    const natural = page.media.some((m) => m.kind === "video")
      ? CARD_W_VIDEO
      : CARD_W_PHOTO;
    const room = Math.max(0, columnW - minText() - GALLERY_GAP);
    return Math.min(1, room / natural);
  }
  const cardScale = cardScaleOf();
  /** on a narrow sheet the writing needs more room than the pictures do */
  function minText(): number {
    return columnW < 340 ? 150 : MIN_TEXT;
  }

  /** how wide a card sits on the sheet */
  function cardWidthOf(item: MediaItem): number {
    const natural = item.kind === "video" ? CARD_W_VIDEO : CARD_W_PHOTO;
    return Math.round(natural * cardScale);
  }

  /** where across the sheet a card sits — the hand decides */
  function leftOf(item: MediaItem): number {
    const w = cardWidthOf(item);
    const x = typeof item.x === "number" ? item.x : defaultX();
    return Math.max(0, Math.min(columnW - w, Math.round(x * columnW)));
  }
  /** the default: tucked against the page's right edge */
  function defaultX(): number {
    const widest = page?.media.reduce(
      (acc, m) => Math.max(acc, cardWidthOf(m)),
      0,
    );
    if (!widest) return 1;
    return Math.max(0, (columnW - widest) / columnW);
  }

  /** the writing takes the room the pictures leave — and it keeps to
      the same side while you drag, so the page never jumps around */
  function writingBox(): { left: number; width: number } {
    if (!page?.media.length) return { left: 0, width: columnW };
    let leftmost = columnW;
    let rightmost = 0;
    for (const m of page.media) {
      const l = leftOf(m);
      leftmost = Math.min(leftmost, l);
      rightmost = Math.max(rightmost, l + cardWidthOf(m));
    }
    const leftStrip = Math.max(0, leftmost - GALLERY_GAP);
    const rightStrip = Math.max(0, columnW - rightmost - GALLERY_GAP);
    // the writing hugs the red margin unless the pictures crowd it out
    if (leftStrip >= minText() || rightStrip < minText()) {
      return { left: 0, width: Math.max(minText(), leftStrip) };
    }
    return { left: rightmost + GALLERY_GAP, width: rightStrip };
  }
  const writing = writingBox();

  /** the line a memory is pinned to — its own, whatever gets written
      around it. Older pages had no pin yet: they sit below the writing
      until the hand moves them. */
  function atOf(item: MediaItem, i: number): number {
    if (typeof item.at === "number") return item.at;
    const textLines = value.split("\n").length;
    return textLines + 1 + i * 7;
  }

  // one-time: pin the memories that were laid out by the old flow, so
  // from now on they never move on their own
  useEffect(() => {
    const media = page?.media ?? [];
    if (media.length === 0) return;
    if (media.every((m) => typeof m.at === "number")) return;
    const textLines = value.split("\n").length;
    for (const m of media) {
      if (typeof m.at === "number") continue;
      const i = media.indexOf(m);
      onPlaceMedia(m.id, textLines + 1 + i * 7, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pinning runs once per page
  }, [page?.media.length]);

  // the inner sheet: header slots + bottom padding are exact multiples of
  // --rule, so whole lines fit with nothing left over
  useEffect(() => {
    const el = pagerRef.current;
    if (!el) return undefined;
    const ruleOf = (node: HTMLDivElement): number => {
      const raw = getComputedStyle(node).getPropertyValue("--rule").trim();
      if (raw.endsWith("rem")) {
        return (
          parseFloat(raw) *
          parseFloat(getComputedStyle(document.documentElement).fontSize)
        );
      }
      if (raw.endsWith("px")) return parseFloat(raw);
      return 36;
    };
    const measure = () => {
      const rule = ruleOf(el);
      const lines = Math.max(3, Math.floor((el.clientHeight - rule * 4) / rule));
      setRulePx(rule);
      setFreeLines(lines);
      const col = writingRef.current;
      if (col) {
        const cs = getComputedStyle(col);
        // the space between the red margin and the page's edge — what
        // the writing and the gallery actually share
        const avail =
          col.clientWidth - parseFloat(cs.paddingLeft || "0") - parseFloat(cs.paddingRight || "0");
        setColumnW(Math.max(0, Math.round(avail)));
        setPadLeft(Math.round(parseFloat(cs.paddingLeft || "0")));
      }
      const ink = inkRef.current;
      if (ink) {
        const r = ink.getBoundingClientRect();
        setInkSize({ w: Math.round(r.width), h: Math.round(r.height) });
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (writingRef.current) ro.observe(writingRef.current);
    return () => ro.disconnect();
  }, [page?.media.length]);

  // the ruled area grows with the writing — no transition, instant
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value, iso]);

  useEffect(
    () => () => {
      if (tooBigTimer.current) clearTimeout(tooBigTimer.current);
    },
    [],
  );

  async function handleFiles(files: FileList, at?: number, x?: number) {
    if (locked) return; // the tape waits for the edit key
    const results = await onAddFiles(files, at, x);
    const bad = results.find((r) => !r.ok);
    if (bad && !bad.ok) {
      setTooBig(bad.name);
      if (tooBigTimer.current) clearTimeout(tooBigTimer.current);
      tooBigTimer.current = setTimeout(() => setTooBig(null), TOO_BIG_MS);
    }
  }

  /* ---------- a voice note, recorded right here ---------- */

  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function startRecording() {
    if (recording || locked) return;
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        // the recorder's type carries ";codecs=opus" — the vault wants
        // the plain type
        const type = (rec.mimeType || "audio/webm").split(";")[0];
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        if (blob.size === 0) return;
        const name = `voice note ${new Date().toLocaleTimeString()}`;
        const file = new File([blob], `${name}.${type.includes("mp4") ? "m4a" : "webm"}`, {
          type,
        });
        const list = {
          0: file,
          length: 1,
          item: () => file,
        } as unknown as FileList;
        void handleFiles(list);
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
      setRecSeconds(0);
      if (recTimerRef.current) clearInterval(recTimerRef.current);
      recTimerRef.current = setInterval(() => setRecSeconds((s) => s + 1), 1000);
    } catch {
      // no microphone, or permission refused
      setRecording(false);
    }
  }

  function stopRecording() {
    const rec = recorderRef.current;
    recorderRef.current = null;
    if (recTimerRef.current) {
      clearInterval(recTimerRef.current);
      recTimerRef.current = null;
    }
    setRecording(false);
    setRecSeconds(0);
    if (rec && rec.state !== "inactive") rec.stop();
  }

  useEffect(
    () => () => {
      if (recTimerRef.current) clearInterval(recTimerRef.current);
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") {
        rec.stream.getTracks().forEach((t) => t.stop());
      }
    },
    [],
  );

  /* where on the sheet did the hand let go? a line, and a spot across */
  function placeAt(clientX: number, clientY: number, cardW: number): { at: number; x: number } {
    const col = writingRef.current?.getBoundingClientRect();
    const top = col?.top ?? 0;
    const left = col?.left ?? 0;
    const rule = rulePx || 36;
    const at = Math.max(0, Math.round((clientY - top) / rule));
    // the card centres on the cursor, so it lands where the hand let go
    const across = (clientX - left - padLeft - cardW / 2) / Math.max(1, columnW);
    const x = Math.max(0, Math.min(1, across));
    return { at, x };
  }

  /* ---------- the pen: freehand marks on the paper ---------- */

  const strokes = page?.strokes ?? [];

  /** where on the sheet the pen is, as fractions of the paper */
  function inkPoint(e: React.PointerEvent): { x: number; y: number } {
    const r = inkRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return {
      x: (e.clientX - r.left) / Math.max(1, r.width),
      y: (e.clientY - r.top) / Math.max(1, r.height),
    };
  }

  function inkDown(e: React.PointerEvent<SVGSVGElement>) {
    if (!pen) return;
    // every finger that touches the paper is counted
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size >= 2) {
      // two fingers: the page pans instead of drawing
      panRef.current = fingerAverage();
      setLive(null);
      return;
    }
    e.preventDefault();
    if (tool === "eraser") {
      eraseAt(inkPoint(e));
      return;
    }
    if (tool === "fill") {
      fillAt(inkPoint(e));
      return;
    }
    const p = inkPoint(e);
    const wide = tool === "highlighter";
    const br = BRUSHES.find((b) => b.id === brush) ?? BRUSHES[1];
    const tex = TEXTURES.find((t) => t.id === texture) ?? TEXTURES[0];
    setLive({
      id: newId(),
      color: penColor,
      kind: wide ? "highlighter" : "pen",
      tex: wide ? "smooth" : tex.id,
      // a real stylus presses harder — the line follows
      w:
        (wide ? HIGHLIGHT_WIDTH : PEN_WIDTH) *
        br.mult *
        (wide ? 1 : tex.mult) *
        (e.pointerType === "pen" && e.pressure > 0 ? 1 + e.pressure : 1),
      pts: [p.x, p.y],
    });
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* no capture — the mark still draws while over the paper */
    }
  }

  function inkMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size >= 2) {
      // two fingers: pan the page under them
      const avg = fingerAverage();
      if (panRef.current) {
        const pager = pagerRef.current;
        if (pager) {
          pager.scrollTop -= avg.y - panRef.current.y;
          pager.scrollLeft -= avg.x - panRef.current.x;
        }
      }
      panRef.current = avg;
      return;
    }
    if (tool === "eraser") {
      if (e.buttons === 0 && !live) return;
      eraseAt(inkPoint(e));
      return;
    }
    if (!live) return;
    e.preventDefault();
    const p = inkPoint(e);
    setLive((s) => {
      if (!s) return s;
      const n = s.pts.length;
      // points closer than a hair's breadth don't change the line — and
      // every point travels to the other devices
      const dx = Math.abs(p.x - s.pts[n - 2]) * inkSize.w;
      const dy = Math.abs(p.y - s.pts[n - 1]) * inkSize.h;
      if (dx < 1.5 && dy < 1.5) return s;
      return { ...s, pts: [...s.pts, p.x, p.y] };
    });
  }

  function inkUp(e: React.PointerEvent<SVGSVGElement>) {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) panRef.current = null;
    if (!live) return;
    const next = [...strokes, live];
    setLive(null);
    onStrokes(next);
  }

  /** where the fingers are, together */
  function fingerAverage(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    for (const p of pointersRef.current.values()) {
      x += p.x;
      y += p.y;
    }
    const n = Math.max(1, pointersRef.current.size);
    return { x: x / n, y: y / n };
  }

  /** the eraser takes back any mark the hand sweeps over */
  function eraseAt(p: { x: number; y: number }) {
    const near = strokesNear(p);
    const kept = strokes.filter((s) => !near.includes(s));
    if (kept.length !== strokes.length) onStrokes(kept);
  }

  /** the paint pot pours colour into the shape the hand points at */
  function fillAt(p: { x: number; y: number }) {
    const near = strokesNear(p);
    if (near.length > 0) {
      // straight on the line
      const target = near[near.length - 1];
      onStrokes(
        strokes.map((s) => (s.id === target.id ? { ...s, fill: penColor } : s)),
      );
      return;
    }
    // or inside the shape it drew
    const inside = strokes.filter((s) => encloses(s, p));
    if (inside.length === 0) return;
    const target = inside[inside.length - 1];
    onStrokes(
      strokes.map((s) => (s.id === target.id ? { ...s, fill: penColor } : s)),
    );
  }

  /** is the point inside the shape the stroke drew? */
  function encloses(s: Stroke, p: { x: number; y: number }): boolean {
    if (s.pts.length < 6) return false;
    const r = inkRef.current?.getBoundingClientRect();
    if (!r) return false;
    const px = p.x * r.width;
    const py = p.y * r.height;
    const n = s.pts.length / 2;
    let inside = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = s.pts[i * 2] * r.width;
      const yi = s.pts[i * 2 + 1] * r.height;
      const xj = s.pts[j * 2] * r.width;
      const yj = s.pts[j * 2 + 1] * r.height;
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  }

  /** the marks under the hand */
  function strokesNear(p: { x: number; y: number }): Stroke[] {
    const r = inkRef.current?.getBoundingClientRect();
    if (!r) return [];
    const px = p.x * r.width;
    const py = p.y * r.height;
    const out: Stroke[] = [];
    for (const s of strokes) {
      for (let i = 0; i < s.pts.length; i += 2) {
        const dx = s.pts[i] * r.width - px;
        const dy = s.pts[i + 1] * r.height - py;
        if (dx * dx + dy * dy < 22 * 22) {
          out.push(s);
          break;
        }
      }
    }
    return out;
  }

  /** the path of a mark, in the paper's own pixels */
  function pathOf(s: Stroke): string {
    if (s.pts.length < 4) {
      // a single tap: a dot
      const x = (s.pts[0] ?? 0) * inkSize.w;
      const y = (s.pts[1] ?? 0) * inkSize.h;
      return `M ${x} ${y} l 0.01 0`;
    }
    let d = "";
    for (let i = 0; i < s.pts.length; i += 2) {
      const x = s.pts[i] * inkSize.w;
      const y = s.pts[i + 1] * inkSize.h;
      d += `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)} `;
    }
    return d;
  }

  /* ---------- dragging a memory around the sheet ----------
     A mouse drags straight away. A finger needs a long press first, so
     the page can still be scrolled by swiping over a photo. */
  const dragRef = useRef<{
    id: string;
    pointerId: number;
    startX: number;
    startY: number;
    left: number;
    top: number;
    dx: number;
    dy: number;
    active: boolean;
    timer: ReturnType<typeof setTimeout> | null;
  } | null>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  // a drag that ends on a button must not also click it
  const draggedRef = useRef(false);

  function endDrag(commit: boolean) {
    const d = dragRef.current;
    dragRef.current = null;
    if (d?.timer) clearTimeout(d.timer);
    window.removeEventListener("touchmove", blockTouchScroll);
    if (!d || !d.active) {
      setDrag(null);
      return;
    }
    // a click that didn't really move is still a click
    const moved = Math.abs(d.dx) > 4 || Math.abs(d.dy) > 4;
    if (commit && moved) {
      const at = Math.max(0, Math.round((d.top + d.dy) / (rulePx || 36)));
      const x = Math.max(
        0,
        Math.min(1, (d.left + d.dx - padLeft) / Math.max(1, columnW)),
      );
      onPlaceMedia(d.id, at, x);
      // the click that follows a drag must not open anything
      draggedRef.current = true;
      window.setTimeout(() => {
        draggedRef.current = false;
      }, 60);
    }
    setDrag(null);
  }

  // while a finger drags a memory, the page must not scroll under it
  function blockTouchScroll(e: TouchEvent) {
    if (dragRef.current?.active) e.preventDefault();
  }

  function onCardPointerDown(
    e: React.PointerEvent<HTMLDivElement>,
    item: MediaItem,
    i: number,
  ) {
    if (locked) return;
    const target = e.target as HTMLElement;
    // the caption field and the un-tape button keep their own ways
    if (target.closest("input, textarea")) return;
    if (target.closest('button[aria-label^="Un-tape"]')) return;
    const d = {
      id: item.id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      left: padLeft + leftOf(item),
      top: atOf(item, i) * (rulePx || 36),
      dx: 0,
      dy: 0,
      active: false,
      timer: null as ReturnType<typeof setTimeout> | null,
    };
    d.timer = setTimeout(() => {
      const cur = dragRef.current;
      if (!cur || cur.id !== item.id) return;
      cur.active = true;
      setDrag({ id: cur.id, dx: 0, dy: 0 });
      window.addEventListener("touchmove", blockTouchScroll, { passive: false });
      // from here on the finger belongs to the picture, not the page
      try {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      } catch {
        /* no capture on this browser — the drag still works */
      }
    }, 320);
    dragRef.current = d;

    // a mouse grabs the picture straight away; a finger has to wait, so
    // the page can still be scrolled by swiping over a photo
    if (e.pointerType === "mouse") {
      if (d.timer) clearTimeout(d.timer);
      d.timer = null;
      d.active = true;
      setDrag({ id: d.id, dx: 0, dy: 0 });
      // keep the moves coming even when the cursor leaves the card
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* no capture available — the drag still works while over the card */
      }
    }
  }

  function onCardPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    d.dx = e.clientX - d.startX;
    d.dy = e.clientY - d.startY;
    if (!d.active) {
      // moved before the long press — that was a scroll, not a drag
      if (Math.abs(d.dx) > 10 || Math.abs(d.dy) > 10) {
        if (d.timer) clearTimeout(d.timer);
        dragRef.current = null;
      }
      return;
    }
    setDrag({ id: d.id, dx: d.dx, dy: d.dy });
  }

  function onCardPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    endDrag(true);
  }

  /* ---------- the memory's place across the sheet ---------- */
  /** a card's position across the sheet, as a fraction */
  function xOf(item: MediaItem): number {
    if (typeof item.x === "number") return item.x;
    return defaultX();
  }

  // click any free line on the sheet and the pen lands there — the
  // taped memories stay exactly where they are
  function onPageClick(e: MouseEvent<HTMLDivElement>) {
    const t = e.target as HTMLElement;
    if (t.closest("button, input, figure, a")) return; // media & controls keep their own ways
    if (locked) {
      onEditToggle(); // reaching for a line asks for the pen
      return;
    }
    const ta = textRef.current;
    if (!ta || t.closest("textarea")) return; // the textarea places its own caret
    const rect = ta.getBoundingClientRect();
    const rule = rulePx || 36;
    const line = Math.max(0, Math.floor((e.clientY - rect.top) / rule));
    const lines = value.split("\n");
    if (line < lines.length) {
      let caret = 0;
      for (let i = 0; i < line; i++) caret += lines[i].length + 1;
      caret += lines[line].length;
      ta.focus();
      ta.setSelectionRange(caret, caret);
      return;
    }
    // a free line below the writing: grow the sheet down to that line
    const pad = "\n".repeat(line - lines.length + 1);
    onText(value + pad);
    requestAnimationFrame(() => {
      const el = textRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }

  function onMediaOver(e: DragEvent<HTMLDivElement>) {
    if (locked) return;
    e.preventDefault();
    setDragging(true);
  }

  // letting go of something on the sheet: a memory the hand dragged to
  // another spot, or files straight from the computer
  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (locked) return;
    const dragged = draggingIdRef.current;
    const item = dragged ? page?.media.find((m) => m.id === dragged) : null;
    const cardW = item
      ? cardWidthOf(item)
      : Math.round(CARD_W_PHOTO * cardScale);
    const spot = placeAt(e.clientX, e.clientY, cardW);
    if (dragged) {
      draggingIdRef.current = null;
      onPlaceMedia(dragged, spot.at, spot.x);
      return;
    }
    if (e.dataTransfer?.files?.length)
      void handleFiles(e.dataTransfer.files, spot.at, spot.x);
  }
  function onDragOver(e: DragEvent<HTMLDivElement>) {
    if (locked) return;
    const types = Array.from(e.dataTransfer?.types ?? []);
    if (types.includes("Files") || types.includes("text/plain") || draggingIdRef.current) {
      e.preventDefault();
      setDragging(true);
    }
  }

  return (
    <div
      ref={pagerRef}
      className="pager sheet pb-[calc(var(--rule)*2)]"
      onClick={onPageClick}
      onDragOver={onDragOver}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {dragging && (
        <div
          className="pointer-events-none absolute inset-3 z-30 rounded-sm border-[3px] border-dashed border-red-ink/70 bg-red-ink/5"
          aria-hidden="true"
        >
          <p className="mt-10 text-center font-hand text-[1.5rem] font-semibold text-red-ink">
            {draggingIdRef.current
              ? "let go — it lands there"
              : "let go — it gets taped right in"}
          </p>
        </div>
      )}
      {/* slot 1 — the edit inkwell, then the date written with the red pen */}
      <div className="flex h-[var(--rule)] items-center pl-7 pr-7 sm:pl-9">
        <button
          type="button"
          onClick={onEditToggle}
          title={locked ? "open this diary with the edit key" : "put the pen down and lock the diary"}
          aria-label={locked ? "Unlock editing with the edit key" : "Lock editing again"}
          className={`press shrink-0 rounded-sm font-note text-[1rem] leading-none outline-none transition-colors ${
            locked ? "text-pencil hover:text-red-ink" : "text-pencil-2 hover:text-red-ink"
          }`}
        >
          {locked ? "✏ edit" : "🔒 lock"}
        </button>
        {!locked && (
          <>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="press tape-pill ml-3 shrink-0 outline-none"
              aria-label="Tape a photo or video onto this page"
              title="tape a photo or video in — it lands where you drop it"
            >
              <span className="font-note text-[0.92rem] leading-none text-pencil">
                ✚ tape
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (recording) stopRecording();
                else void startRecording();
              }}
              aria-pressed={recording}
              aria-label={recording ? "Stop the voice note" : "Record a voice note"}
              title={recording ? "stop the voice note" : "record a voice note"}
              className={`press ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-note text-[1rem] leading-none outline-none transition-colors ${
                recording
                  ? "animate-pulse bg-red-ink/20 text-red-ink"
                  : "text-pencil hover:text-red-ink"
              }`}
            >
              {recording ? "■" : "🎙"}
            </button>
            <button
              type="button"
              onClick={() => {
                onPenChange(!pen);
                setLive(null);
              }}
              aria-pressed={pen}
              aria-label={pen ? "Put the pen down" : "Pick up the pen to draw"}
              title={pen ? "put the pen down" : "pick up the pen and scribble"}
              className={`press ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-note text-[1rem] leading-none outline-none transition-colors ${
                pen ? "bg-red-ink/15 text-red-ink" : "text-pencil hover:text-red-ink"
              }`}
            >
              ✒
            </button>
            {/* take back the last thing done to this page */}
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              aria-label="Take back the last thing"
              title="take it back (ctrl+z)"
              className="press ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-page-2 font-hand text-[1.3rem] leading-none text-ink-strong outline-none shadow-[0_1px_3px_rgb(31_22_12/0.25)] transition-colors hover:text-red-ink disabled:opacity-55"
            >
              ↶
            </button>
          </>
        )}
        <p className="font-hand ml-auto truncate text-[1.4rem] font-semibold leading-none text-red-ink">
          {longDate(iso)}
        </p>
        {!locked && (
          <button
            type="button"
            onClick={() => setConfirmTear(true)}
            className="press ml-3 shrink-0 font-note text-[0.95rem] leading-none text-pencil-2 outline-none transition-colors hover:text-red-ink"
            aria-label="Tear this page out"
            title="tear out this page"
          >
            ✂
          </button>
        )}
      </div>

      {/* slot 2 — sticker mood row / the tear-out confirm */}
      <div className="flex h-[var(--rule)] items-center gap-1.5 pl-[calc(var(--margin-x)+0.9rem)]">
        {confirmTear ? (
          <div className="tear-note flex items-center gap-3 px-2.5 py-0.5">
            <span className="font-note text-[0.95rem] leading-tight text-pencil">
              this page goes in the drawer forever —
            </span>
            <button
              type="button"
              className="press font-hand text-[1.05rem] font-semibold leading-none text-red-ink outline-none"
              onClick={() => {
                setConfirmTear(false);
                onTearOut();
              }}
            >
              tear it out
            </button>
            <button
              type="button"
              className="press font-hand text-[1.05rem] leading-none text-ink outline-none"
              onClick={() => setConfirmTear(false)}
            >
              keep writing
            </button>
          </div>
        ) : pen ? (
          /* the pen's tools and colours, while the pen is in hand */
          <div
            className="flex items-center gap-2 overflow-x-auto pr-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="group"
            aria-label="The pen's tools and colours"
          >
            {TOOLS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTool(t.id)}
                aria-pressed={tool === t.id}
                aria-label={t.label}
                title={t.label}
                className={`press flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-note text-[0.95rem] leading-none outline-none transition-colors ${
                  tool === t.id
                    ? "bg-red-ink/15 text-red-ink"
                    : "text-pencil hover:text-red-ink"
                }`}
              >
                {t.icon}
              </button>
            ))}
            <span className="h-5 w-px shrink-0 bg-pencil/30" aria-hidden="true" />
            {/* the colours — one set, for the pen and for the typing */}
            {PEN_COLOURS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setPenColor(c.hex);
                  onTextColor(c.hex);
                }}
                title={c.name}
                aria-label={c.name}
                aria-pressed={penColor === c.hex}
                className="press h-5 w-5 shrink-0 rounded-full border-2 outline-none transition-transform hover:scale-125"
                style={{
                  backgroundColor: c.hex,
                  borderColor: penColor === c.hex ? "var(--color-red-ink)" : "transparent",
                }}
              />
            ))}
            <span className="h-5 w-px shrink-0 bg-pencil/30" aria-hidden="true" />
            {/* the nibs and the textures */}
            <button
              type="button"
              onClick={() => setBrushMenu((b) => !b)}
              aria-expanded={brushMenu}
              aria-label="The brush: its nib and its texture"
              title="nib & texture"
              className={`press flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-note text-[0.95rem] leading-none outline-none ${
                brushMenu ? "bg-red-ink/15 text-red-ink" : "text-pencil hover:text-red-ink"
              }`}
            >
              🖌
            </button>
            <button
              type="button"
              onClick={() => onPenChange(false)}
              aria-label="Put the pen down and write with the keyboard instead"
              title="put the pen down"
              className="press shrink-0 font-hand text-[1.1rem] leading-none text-pencil-2 outline-none"
            >
              ✎
            </button>
          </div>
        ) : (
          <div
            className={`flex items-center gap-1 ${locked ? "pointer-events-none opacity-40" : ""}`}
            role="group"
            aria-label="Today's sticker"
          >
            {DOODLES.map((key) => {
              const Art = DOODLE_ART[key];
              const selected = page?.doodle === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onDoodle(selected ? null : key)}
                  title={DOODLE_NAMES[key]}
                  aria-label={DOODLE_NAMES[key]}
                  aria-pressed={selected}
                  className={`press sticker relative flex h-8 w-8 items-center justify-center rounded-full outline-none transition-colors hover:text-red-ink ${
                    selected ? "text-ink" : "text-pencil"
                  }`}
                >
                  <Art className="sticker-art h-6 w-6" />
                  {selected && (
                    <span
                      className="pointer-events-none absolute inset-0"
                      style={{ transform: `rotate(${tiltOf(key) / 2}deg)` }}
                    >
                      <InkCircleMini />
                    </span>
                  )}
                </button>
              );
            })}
            {/* the ink the typing is in */}
            {!locked && (
              <button
                type="button"
                onClick={() => setWritingColours((w) => !w)}
                aria-expanded={writingColours}
                aria-label="Change the colour of the writing"
                title="the colour of the writing"
                className="press ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-page-2 font-note text-[0.95rem] leading-none outline-none shadow-[0_1px_3px_rgb(31_22_12/0.25)] transition-colors hover:text-red-ink"
              >
                <span
                  className="h-3.5 w-3.5 rounded-full border border-ink/25"
                  style={{
                    backgroundColor: page?.textColor ?? "#2a4494",
                  }}
                />
              </button>
            )}
          </div>
        )}
      </div>

      {/* the writing above the taped memories — ballpoint on the ruled
          lines; while nothing is taped in, the whole blank sheet belongs
          to the pen */}
      {/* the nibs and the textures */}
      {brushMenu && (
        <div
          className="absolute right-8 top-[calc(var(--rule)*2+8px)] z-40 flex items-center gap-3 rounded-sm bg-page-2 px-3 py-2 shadow-[0_10px_30px_-8px_rgba(0,0,0,0.5)]"
          role="group"
          aria-label="The brush"
        >
          <span className="font-note text-[0.85rem] leading-none text-pencil-2">nib</span>
          {BRUSHES.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setBrush(b.id)}
              aria-pressed={brush === b.id}
              aria-label={b.name}
              title={b.name}
              className={`press flex h-7 w-7 shrink-0 items-center justify-center rounded-full outline-none ${
                brush === b.id ? "bg-red-ink/15" : ""
              }`}
            >
              <span
                className={`rounded-full bg-ink ${b.dot}`}
                style={{ opacity: brush === b.id ? 1 : 0.45 }}
              />
            </button>
          ))}
          <span className="h-5 w-px bg-pencil/30" aria-hidden="true" />
          <span className="font-note text-[0.85rem] leading-none text-pencil-2">texture</span>
          {TEXTURES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTexture(t.id)}
              aria-pressed={texture === t.id}
              aria-label={t.name}
              title={t.name}
              className={`press flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-note text-[0.85rem] leading-none outline-none ${
                texture === t.id
                  ? "bg-red-ink/15 text-red-ink"
                  : "text-pencil hover:text-red-ink"
              }`}
            >
              {t.id === "smooth" ? "•" : t.id === "water" ? "≈" : "✧"}
            </button>
          ))}
        </div>
      )}

      {/* the colours the typing can be in */}
      {writingColours && (
        <div
          className="absolute right-8 top-[calc(var(--rule)*2+8px)] z-40 flex items-center gap-2 rounded-sm bg-page-2 px-3 py-2 shadow-[0_10px_30px_-8px_rgba(0,0,0,0.5)]"
          role="group"
          aria-label="The colour of the writing"
        >
          {PEN_COLOURS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onTextColor(c.hex);
                setWritingColours(false);
              }}
              title={c.name}
              aria-label={`write in ${c.name}`}
              aria-pressed={(page?.textColor ?? "#2a4494") === c.hex}
              className="press h-6 w-6 shrink-0 rounded-full border-2 outline-none transition-transform hover:scale-110"
              style={{
                backgroundColor: c.hex,
                borderColor:
                  (page?.textColor ?? "#2a4494") === c.hex
                    ? "var(--color-red-ink)"
                    : "transparent",
              }}
            />
          ))}
          <span className="ml-1 shrink-0 font-note text-[0.85rem] leading-none text-pencil-2">
            for the typing
          </span>
        </div>
      )}

      {/* the writing — the whole sheet belongs to the pen. The taped
          memories live in the gallery on the right; the writing runs in
          the space beside them, so nothing is ever covered or cut off. */}
      <div
        ref={writingRef}
        className="relative pr-8 pl-[calc(var(--margin-x)+0.9rem)]"
      >
        <div
          style={{
            width: `${Math.round(writing.width)}px`,
            maxWidth: "100%",
            marginLeft: `${Math.round(writing.left)}px`,
          }}
        >
          <textarea
            ref={textRef}
            value={value}
            onChange={(e) => onText(e.target.value)}
            placeholder={
              locked ? "(the pen waits — tap ✏ edit)" : "(so… today?)"
            }
            readOnly={locked || pen}
            aria-readonly={locked || pen || undefined}
            aria-describedby={locked ? "sheet-locked-note" : undefined}
            spellCheck={false}
            aria-label="Write today's page"
            className="write-box"
            style={{
              color: page?.textColor ?? undefined,
              ...(freeLines > 0
                ? { minHeight: `${Math.round(freeLines * rulePx)}px` }
                : {}),
            }}
          />
          <p id="sheet-locked-note" className="sr-only">
            This page is locked for editing. Press the edit button to unlock.
          </p>
        </div>

        {/* the ink — freehand marks on the paper */}
        <svg
          ref={inkRef}
          className="ink-layer absolute inset-0 z-20 h-full w-full"
          style={{ pointerEvents: pen ? "auto" : "none" }}
          onPointerDown={inkDown}
          onPointerMove={inkMove}
          onPointerUp={inkUp}
          onPointerCancel={inkUp}
          aria-label="Marks on this page"
        >
          <defs>
            {/* a wet edge for the watercolour brush */}
            <filter id="pd-water" x="-25%" y="-25%" width="150%" height="150%">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.018"
                numOctaves="3"
                seed="7"
                result="noise"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="noise"
                scale="7"
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
            {/* a rough, dusty edge for the chalk */}
            <filter id="pd-chalk" x="-25%" y="-25%" width="150%" height="150%">
              <feTurbulence
                type="turbulence"
                baseFrequency="0.06"
                numOctaves="4"
                seed="3"
                result="grit"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="grit"
                scale="5"
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
          </defs>
          {[...strokes, ...(live ? [live] : [])]
            .slice()
            .sort((a, b) => (a.kind === "highlighter" ? -1 : 1) - (b.kind === "highlighter" ? -1 : 1))
            .map((s) => {
              const tex = TEXTURES.find((t) => t.id === (s.tex ?? "smooth"));
              const filter = s.kind === "highlighter" ? undefined : tex?.filter;
              return (
                <g key={s.id}>
                  {/* the colour poured inside the shape */}
                  {s.fill && s.pts.length >= 6 && (
                    <path
                      d={`${pathOf(s)} Z`}
                      fill={s.fill}
                      fillOpacity={0.45}
                      stroke="none"
                    />
                  )}
                  <path
                    d={pathOf(s)}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={Math.max(1, s.w * inkSize.w)}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={s.kind === "highlighter" ? 0.38 : s.tex === "water" ? 0.8 : 1}
                    filter={filter}
                    style={filter ? { mixBlendMode: "multiply" } : undefined}
                  />
                </g>
              );
            })}
        </svg>

        {/* the gallery — the taped memories, pinned to their own lines.
            only the hand moves them: the ▲▼ pencils, or a drag to
            another line. */}
        {hasMedia && (
          <div className="pointer-events-none absolute inset-0">
            {page?.media.map((item, i) => {
              const isDragging = drag?.id === item.id;
              return (
              <div
                key={item.id}
                className="pointer-events-auto absolute"
                style={{
                  top: `${Math.round(atOf(item, i) * rulePx) + (isDragging ? drag.dy : 0)}px`,
                  left: `${Math.round(padLeft + leftOf(item)) + (isDragging ? drag.dx : 0)}px`,
                  ...(isDragging
                    ? { zIndex: 30, cursor: "grabbing", touchAction: "none" }
                    : {}),
                }}
                onPointerDown={(e) => onCardPointerDown(e, item, i)}
                onPointerMove={onCardPointerMove}
                onPointerUp={onCardPointerUp}
                onPointerCancel={() => endDrag(false)}
              >
                <div
                  style={{
                    transform: cardScale < 1 ? `scale(${cardScale})` : undefined,
                    transformOrigin: "top left",
                  }}
                >
                  <MediaCard
                    item={item}
                    locked={locked}
                    first={atOf(item, i) <= 0}
                    last={false}
                    onCaptionChange={(caption) => onCaption(item.id, caption)}
                    onRemove={() => onRemoveMedia(item.id)}
                    onOpen={(url) => {
                      if (draggedRef.current) return; // that was a drag, not a tap
                      onOpenMedia(item, url);
                    }}
                  />
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>

      {/* the file picker — the tape button up in the corner opens it */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*,audio/*"
        multiple
        hidden
        onChange={(e) => {
          if (locked) return;
          if (e.target.files && e.target.files.length > 0) void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {locked ? (
        <p className="pt-10 font-note text-[1rem] leading-snug text-pencil-2">
          (tape & stickers wait — press "edit" in the top corner
          <br />
          to pick the pen up)
        </p>
      ) : null}

      {/* the keeper is speaking — the note is being taken */}
      {recording && (
        <div
          className="chip-in chip-safe fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-sm bg-page-2 px-4 py-2 shadow-[0_10px_30px_-6px_rgba(0,0,0,0.4)]"
          role="status"
        >
          <span className="flex items-center gap-2 font-note text-[1.05rem] text-red-ink">
            <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-red-ink" />
            recording — {Math.floor(recSeconds / 60)}:{String(recSeconds % 60).padStart(2, "0")}
          </span>
          <button
            type="button"
            onClick={stopRecording}
            className="press scribble font-hand text-[1.15rem] font-semibold leading-none text-red-ink outline-none"
          >
            stop
          </button>
        </div>
      )}

      {/* a memory too heavy for the diary says so, right where you are */}
      {tooBig && (
        <div
          className="chip-in chip-safe fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center rounded-sm bg-page-2 px-4 py-2 shadow-[0_10px_30px_-6px_rgba(0,0,0,0.4)]"
          role="status"
        >
          <span className="font-note text-[1.05rem] text-red-ink">
            (that one is too heavy for the diary — try trimming it down)
          </span>
        </div>
      )}

      {/* the fresh-page note and the page number */}
      {empty && hasMedia && (
        <p className="mx-auto w-fit pt-14 font-note text-[1.05rem] leading-relaxed text-pencil-2">
          (a fresh page — write something first)
        </p>
      )}
      <p className="mt-10 text-right font-note text-[1rem] text-pencil-2">
        page no. {pageCount + 1} <span className="opacity-70">· paper days</span>
      </p>
    </div>
  );
}

/** ink circle for selected stickers — tiny, hand-drawn */
function InkCircleMini() {
  return (
    <svg
      viewBox="0 0 64 64"
      className="h-full w-full"
      fill="none"
      stroke="currentColor"
      strokeWidth={3.4}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path
        d="M14 36C13 20 30 11 39.5 11 52 11 61 20 60 32 59 47 46 56 32 55 20 54 9 49 10 38 11 28 21 20 30 17"
        strokeOpacity="0.7"
      />
    </svg>
  );
}
