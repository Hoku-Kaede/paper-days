"use client";

/* The whole experience: a closed kraft diary on a wooden desk.
   Click the band, the cover swings open (a rare, deliberate moment —
   it earns its long animation), and the pages are waiting.
   The book is one for everyone: the same pages on every device, the
   cloud keeping them together. The keeper's phrase opens the pen;
   without it, every page is read-only. */

import { useCallback, useEffect, useRef, useState } from "react";
import { type DiaryApi, useDiary } from "@/lib/use-diary";
import { clearUnlocked, keeperToken, readUnlocked, storeUnlocked } from "@/lib/auth";
import { shortDate } from "@/lib/dates";
import { deleteMediaFile, uploadMediaFile } from "@/lib/sync";
import type { MediaItem } from "@/lib/db";
import { newId } from "@/lib/rand";
import { Paperclip, Squiggle } from "./doodles";
import { Book } from "./book";
import { EditGate } from "./edit-gate";

type Phase = "cover" | "opening" | "open" | "closing";

/** the picture taped on the cover until the keeper chooses another */
const DEFAULT_COVER_PHOTO =
  "https://qs6hvlbemaf1xbfu.public.blob.vercel-storage.com/pd-diary/8b267f8c4a394547a10c.jpeg";

function openDuration(): number {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? 260
    : 950;
}

export function DiaryApp() {
  const api = useDiary();
  const [phase, setPhase] = useState<Phase>("cover");
  const bookRegion = useRef<HTMLDivElement | null>(null);
  // the keeper's key: read-only until the phrase is entered in this session
  const [editing, setEditing] = useState(false);
  const [gate, setGate] = useState(false);
  // the book's look: which cover it wears, and the theme picker
  const [themes, setThemes] = useState(false);
  const [fonts, setFonts] = useState(false);
  const coverFileRef = useRef<HTMLInputElement | null>(null);

  // the theme follows the book's own settings — on every device
  useEffect(() => {
    const theme = api.settings.theme;
    if (theme) document.documentElement.setAttribute("data-theme", theme);
    else document.documentElement.removeAttribute("data-theme");
  }, [api.settings.theme]);

  // and so does the hand the book is written in
  useEffect(() => {
    const font = api.settings.font;
    if (font) document.documentElement.setAttribute("data-font", font);
    else document.documentElement.removeAttribute("data-font");
  }, [api.settings.font]);

  const THEMES = [
    { id: "kraft", name: "kraft", hex: "#bb8c5f" },
    { id: "midnight", name: "midnight", hex: "#46536d" },
    { id: "blush", name: "blush", hex: "#d69b96" },
    { id: "forest", name: "forest", hex: "#7f9d70" },
    { id: "ink", name: "black journal", hex: "#35322e" },
  ];
  const FONTS = [
    { id: "kalam", name: "the usual hand", sample: "Ching" },
    { id: "neat", name: "a neat hand", sample: "Ching" },
    { id: "marker", name: "a bold marker", sample: "Ching" },
    { id: "casual", name: "a quick scrawl", sample: "Ching" },
  ];

  // sessionStorage again on revisit (fresh tabs start with the pen resting)
  useEffect(() => {
    const unlocked = readUnlocked();
    if (unlocked && !keeperToken()) {
      // the session remembers the keeper, but the token is gone — the
      // phrase is needed once more before writing
      clearUnlocked();
      setEditing(false);
      setGate(true);
      return;
    }
    setEditing(unlocked);
  }, []);

  // the server turned the token away mid-session: ask for the phrase
  useEffect(() => {
    if (api.keyExpired) {
      setEditing(false);
      setGate(true);
    }
  }, [api.keyExpired]);

  const requestEdit = useCallback(() => setGate(true), []);
  const unlock = useCallback(() => {
    storeUnlocked();
    setEditing(true);
    setGate(false);
  }, []);
  const lock = useCallback(() => {
    clearUnlocked();
    setEditing(false);
  }, []);

  const open = useCallback(() => setPhase("opening"), []);
  const close = useCallback(() => {
    if (phase !== "open") return;
    setPhase("closing");
    window.setTimeout(() => setPhase("cover"), 210);
  }, [phase]);

  // hand control over to the book once the cover has finished swinging
  useEffect(() => {
    if (phase !== "opening") return undefined;
    if (!api.ready) {
      const t = window.setTimeout(() => undefined, 120);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => {
      setPhase("open");
      bookRegion.current?.focus?.();
      // on phones the pages flow in-page; the flip happens at the top
      window.scrollTo({ top: 0 });
    }, openDuration());
    return () => window.clearTimeout(t);
  }, [phase, api.ready]);

  // Esc closes the diary when no lightbox grabbed the key first, and the
  // edit gate gets first claim on it too
  useEffect(() => {
    if (phase !== "open") return undefined;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !document.querySelector("[data-edit-gate]")) close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, close]);

  const opening = phase === "opening";

  return (
    <div className="desk relative grid place-items-center overflow-hidden p-4 sm:p-7">
      <h1 className="sr-only">Paper Days — a diary, kept the scrapbook way</h1>

      {/* ---------- the cover ---------- */}
      {phase !== "open" && (
        <div
          className={`book-stage stage-abs z-20 ${opening ? "opening" : ""}`}
        >
          <div className="flex flex-col items-center">
            {/* the cover opens the diary — but it holds buttons of its own,
                so it can't be a button itself */}
            <div
              role="button"
              tabIndex={0}
              aria-label="Open the diary"
              aria-disabled={opening}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("button")) return;
                open();
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                open();
              }}
              className="cover-hit relative cursor-pointer rounded-md outline-none disabled:cursor-wait"
            >
              {/* the cover's own words are its label — this just says what
                  tapping it does */}
              <span className="sr-only">Open the diary</span>
              <div className="relative" style={{ transformStyle: "preserve-3d" }}>
                <div className="cover">
                  {/* red fabric spine */}
                  <div className="spine-tape" aria-hidden="true" />

                  {/* label sticker */}
                  <div className="label absolute left-[17%] top-[31%] w-[230px] max-w-[62%] -rotate-2 px-4 py-4 sm:w-[260px]">
                    <p className="text-center font-hand text-[2rem] leading-tight font-bold text-ink-strong">
                      Ching's Diary ka ba?
                    </p>
                    <p className="pt-0.5 text-center font-note text-[1.05rem] leading-tight text-pencil">
                      a diary, kept the scrapbook way
                    </p>
                  </div>

                  {/* the keeper's tape note — the photo or GIF on the cover */}
                  <div className="absolute left-[38%] top-[47%] w-[56%] -rotate-2 px-3 py-2 text-center">
                    <span className="relative inline-block align-top">
                      {/* eslint-disable-next-line @next/next/no-img-element -- the keeper's own filed photo, not an optimizer concern */}
                      <img
                        src={api.settings.cover?.url ?? DEFAULT_COVER_PHOTO}
                        alt={api.settings.cover?.name ?? "the cover's picture"}
                        className="max-h-[170px] w-auto max-w-full rounded-sm object-cover outline outline-[0.5px] outline-offset-[3px] outline-ink/15"
                      />
                      {/* the clip — gripping the picture itself */}
                      <Paperclip className="absolute -top-3 -left-2 z-10 h-11 w-7 -rotate-[24deg] text-band drop-shadow-[0_1px_2px_rgb(0_0_0/0.35)]" />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!editing) {
                            requestEdit();
                            return;
                          }
                          coverFileRef.current?.click();
                        }}
                        aria-label="Tape a different photo or GIF onto the cover"
                        title="tape a different photo or gif here"
                        className="press absolute -right-2 -bottom-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-page font-note text-[1rem] leading-none text-pencil outline-none shadow-[0_1px_3px_rgb(31_22_12/0.3)] transition-colors hover:text-red-ink"
                      >
                        ✚
                      </button>
                    </span>
                  </div>

                  {/* the "last written" pencil note (the keeper's own desk) */}
                  <div className="absolute right-[7%] bottom-[6%] -rotate-1 text-right">
                    {api.lastWritten ? (
                      <p className="font-note text-[1.05rem] leading-snug text-[var(--color-cover-note)]">
                        last page — {shortDate(api.lastWritten)}
                        <Squiggle className="ml-1 inline-block h-3 w-8 align-baseline text-[var(--color-cover-note)]" />
                      </p>
                    ) : (
                      <p className="font-note text-[1.05rem] leading-snug text-[var(--color-cover-note)]">
                        no pages yet —
                        <br />
                        it's brand new
                      </p>
                    )}
                  </div>

                  {/* the book's own look — which cover it wears */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      // the book's colour is everyone's book — the keeper's
                      // key it is
                      if (!editing) {
                        requestEdit();
                        return;
                      }
                      setThemes((t) => !t);
                    }}
                    aria-expanded={themes}
                    aria-label="Change the book's cover and colours"
                    title="change the book's colours"
                    className="press absolute bottom-[6%] left-[13%] z-30 flex h-9 w-9 items-center justify-center rounded-full font-note text-[1.1rem] leading-none text-[var(--color-cover-note)] outline-none transition-colors hover:text-red-ink"
                  >
                    🎨
                  </button>

                  {/* and which hand the book is written in */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!editing) {
                        requestEdit();
                        return;
                      }
                      setFonts((f) => !f);
                    }}
                    aria-expanded={fonts}
                    aria-label="Change the handwriting the book is written in"
                    title="change the handwriting"
                    className="press absolute bottom-[6%] left-[19%] z-30 flex h-9 w-9 items-center justify-center rounded-full font-hand text-[1.2rem] leading-none text-[var(--color-cover-note)] outline-none transition-colors hover:text-red-ink"
                  >
                    Aa
                  </button>

                  {fonts && (
                    <div className="absolute bottom-[16%] left-[12%] z-40 flex flex-col gap-1 rounded-sm bg-page-2 px-3 py-2 shadow-[0_10px_30px_-8px_rgba(0,0,0,0.5)]">
                      {FONTS.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            api.setSettings({ font: f.id });
                            setFonts(false);
                          }}
                          aria-label={f.name}
                          title={f.name}
                          aria-pressed={(api.settings.font ?? "kalam") === f.id}
                          className={`press flex items-baseline gap-2 rounded-sm px-2 py-1 text-left outline-none ${
                            (api.settings.font ?? "kalam") === f.id ? "bg-red-ink/10" : ""
                          }`}
                        >
                          <span
                            className="font-hand text-[1.3rem] leading-none text-ink-strong"
                            style={{
                              fontFamily:
                                f.id === "neat"
                                  ? "var(--font-neat-hand-g)"
                                  : f.id === "marker"
                                    ? "var(--font-marker-hand-g)"
                                    : f.id === "casual"
                                      ? "var(--font-casual-hand-g)"
                                      : "var(--font-hand-g)",
                            }}
                          >
                            {f.sample}
                          </span>
                          <span className="font-note text-[0.9rem] leading-none text-pencil-2">
                            {f.name}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {themes && (
                    <div className="absolute bottom-[16%] left-[12%] z-40 flex items-center gap-2 rounded-sm bg-page-2 px-3 py-2 shadow-[0_10px_30px_-8px_rgba(0,0,0,0.5)]">
                      {THEMES.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            api.setSettings({ theme: t.id });
                            setThemes(false);
                          }}
                          aria-label={t.name}
                          title={t.name}
                          aria-pressed={api.settings.theme === t.id}
                          className="press h-7 w-7 rounded-full border-2 outline-none transition-transform hover:scale-110"
                          style={{
                            backgroundColor: t.hex,
                            borderColor:
                              (api.settings.theme ?? "kraft") === t.id
                                ? "var(--color-red-ink)"
                                : "transparent",
                          }}
                        />                      ))}
                    </div>
                  )}
                </div>

                {/* inner cream side that appears as the cover swings */}
                <div className="cover-back" aria-hidden="true" />
              </div>

              {/* the elastic band, above everything */}
              <span
                className={`band z-30 ${opening ? "band-off" : ""}`}
                aria-hidden="true"
              />
            </div>

            {/* the cover's picture — a photo or a GIF, filed in the vault */}
            <input
              ref={coverFileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                void (async () => {
                  const item = {
                    id: newId(),
                    kind: "photo" as const,
                    name: file.name,
                    caption: "",
                    createdAt: Date.now(),
                  };
                  const url = await uploadMediaFile(item, file);
                  if (!url) return;
                  const old = api.settings.cover?.url;
                  api.setSettings({ cover: { ...item, url } });
                  if (old) void deleteMediaFile(old);
                })();
              }}
            />

            {/* pencil hint, under the desk */}
            {!opening && (
              <p className="hint-note mt-6 flex items-center gap-1.5 font-note text-[1.15rem]">
                click the cover to open
                <span className="inline-block h-4 w-12 -scale-x-100">
                  <svg viewBox="0 0 64 48" className="h-full w-full" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" aria-hidden="true">
                    <path d="M50 40 Q26 38 8 14" />
                    <path d="M17 13L7.6 13.4 8.8 22" />
                  </svg>
                </span>
              </p>
            )}
          </div>
        </div>
      )}

      {/* ---------- the open book ---------- */}
      {phase !== "cover" && (
        <div
          className={`stage-abs z-10 ${phase === "closing" ? "pointer-events-none opacity-0 transition-opacity duration-150 ease-out" : "fade-in-late"}`}
        >
          <div ref={bookRegion} tabIndex={-1} className="outline-none">
            {api.ready ? (
              <Book api={api} editing={editing} onRequestEdit={requestEdit} onLock={lock} />
            ) : (
              <p className="font-note text-[1.2rem] text-pencil-2">opening the pages…</p>
            )}
          </div>

          {/* close affordance — a floating ✕ on phones, pencil bottom
              left on desktops */}
          <button
            type="button"
            onClick={close}
            className="press max-md:fixed max-md:bottom-3 max-md:right-3 max-md:z-40 max-md:flex max-md:h-11 max-md:w-11 max-md:items-center max-md:justify-center max-md:rounded-full max-md:bg-page max-md:shadow-[0_2px_10px_rgba(31,22,12,0.4)] md:absolute md:bottom-7 md:left-10 md:z-30 rounded-sm font-hand text-[1.15rem] text-pencil-2/90 outline-none transition-colors hover:text-red-ink"
            aria-label="Close the diary"
          >
            ✕<span className="max-md:hidden"> close the diary</span>
          </button>
        </div>
      )}

      {/* the keeper's phrase — opens before the pen is handed over */}
      {gate && <EditGate onClose={() => setGate(false)} onUnlock={unlock} />}

      {/* offline: the cloud is unreachable, writing stays on this device */}
      {phase === "open" && api.ready && api.sync === "offline" && !api.keyExpired && (
        <div
          className="chip-in chip-safe fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-sm bg-page-2 px-4 py-2 shadow-[0_10px_30px_-6px_rgba(0,0,0,0.4)]"
          role="status"
        >
          <span className="font-note text-[1.05rem] text-pencil">
            can't reach the cloud — writing stays on this device for now
          </span>
        </div>
      )}

      {/* undo chip after tearing a page out */}
      {api.undo && (
        <div
          className="chip-in chip-safe fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center justify-center gap-3 rounded-sm bg-page-2 px-4 py-2 shadow-[0_10px_30px_-6px_rgba(0,0,0,0.4)]"
          role="status"
        >
          <span className="font-note text-[1.05rem] text-pencil">page torn out…</span>
          <button
            type="button"
            onClick={api.undoTearOut}
            className="press scribble font-hand text-[1.15rem] font-semibold leading-none text-red-ink outline-none"
          >
            paste it back
          </button>
        </div>
      )}
    </div>
  );
}
