"use client";

/* A taped-in memory: polaroid frame, washi tape, pencil caption below.
   Works for photos and videos alike; videos get a hand-drawn play button. */

import type React from "react";
import { useEffect, useState } from "react";
import type { MediaItem } from "@/lib/db";
import { mediaURL } from "@/lib/db";
import { isFresh, markFaded } from "@/lib/fresh";
import { pick, spread, tiltOf } from "@/lib/rand";
import { PlayDoodle } from "./doodles";

const WASHI = ["washi-butter", "washi-blush", "washi-sage", "washi-sky"] as const;

/* A picture develops once — right after it's taped in. Turning back to
   the page later must not replay the fade: a half-second of a dark,
   washed-out photo reads as the picture going black, not as newness. */

export function MediaCard({
  item,
  locked,
  first,
  last,
  onCaptionChange,
  onRemove,
  onOpen,
}: {
  item: MediaItem;
  /** locked = read-only: caption readable, un-taping hidden */
  locked: boolean;
  /** for the touch reorder pencils: is this the end of the line? */
  first?: boolean;
  last?: boolean;
  onCaptionChange: (caption: string) => void;
  onRemove: () => void;
  onOpen: (url: string) => void;
}) {
  // a taped memory can live in the cloud vault (one URL, seen from any
  // device), as an old inline print, or on this device's shelf (IndexedDB)
  const remoteSrc = item.url ?? item.src ?? null;
  const missed = item.missed === true;
  const [idbUrl, setIdbUrl] = useState<string | null>(null);
  useEffect(() => {
    if (remoteSrc || missed) return undefined;
    let alive = true;
    void mediaURL(item.id).then((u) => {
      if (alive) setIdbUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [item.id, remoteSrc, missed]);
  const url = remoteSrc ?? idbUrl;
  // the fade plays only for a photo just taped in — arriving at a page
  // later shows the picture plain, never half-developed
  const [develops] = useState(() => isFresh(item.id));
  useEffect(() => {
    if (!develops) return undefined;
    // once the little fade has played, this picture is done developing
    const t = window.setTimeout(() => markFaded(item.id), 700);
    return () => window.clearTimeout(t);
  }, [develops, item.id]);
  const tilt = tiltOf(item.id);
  const tapeMode = spread(item.id, 0, 2); // 0 = one strip, 1 = two corners
  const washiA = pick(item.id, [...WASHI]);
  const washiB = pick(`${item.id}:b`, [...WASHI]);
  const isVideo = item.kind === "video";
  const isAudio = item.kind === "audio";

  return (
    <figure
      className={`photo lift group relative w-fit ${develops ? "pop" : ""}`}
      style={{ "--tilt": `${tilt}deg`, transform: `rotate(${tilt}deg)` } as React.CSSProperties}
    >
      {/* washi tape */}
      {tapeMode === 0 ? (
        <span
          className={`washi ${washiA} -top-3.5 left-1/2 z-10 h-6 -translate-x-1/2 -rotate-2`}
          aria-hidden="true"
        />
      ) : (
        <>
          <span
            className={`washi washi-strip ${washiA} -top-2.5 -left-4 z-10 -rotate-[38deg]`}
            aria-hidden="true"
          />
          <span
            className={`washi washi-strip ${washiB} -top-2.5 -right-4 z-10 rotate-[38deg]`}
            aria-hidden="true"
          />
        </>
      )}

      {/* the picture / video frame */}
      <div
        className={`ph-frame relative ${isAudio ? "h-28 w-64" : isVideo ? "h-40 w-64" : "h-52 w-52"}`}
      >
        {url === null ? (
          <div className="flex h-full w-full items-center justify-center px-2 text-center">
            {missed ? (
              <span className="font-note text-[0.95rem] leading-snug text-white/55">
                (this one stays home — too heavy to travel between devices)
              </span>
            ) : (
              <span className="animate-pulse font-note text-sm text-white/45">developing…</span>
            )}
          </div>
        ) : isAudio ? (
          /* the keeper's own voice — a note to self */
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-3">
            <span className="font-note text-[0.95rem] leading-none text-pencil-2">
              ♪ a voice note
            </span>
            <audio
              src={url}
              controls
              preload="metadata"
              className="w-full max-w-[15rem]"
              aria-label={`voice note: ${item.name}`}
            />
          </div>
        ) : isVideo ? (
          <video
            src={url}
            className="ph-media h-full w-full object-contain"
            preload="metadata"
            muted
            playsInline
            aria-label={`video: ${item.name}`}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- user's own blob; not an optimizer concern
          <img
            src={url}
            alt={item.caption || item.name}
            draggable={false}
            className={`ph-media h-full w-full object-cover ${url !== null && develops ? "develop" : ""}`}
          />
        )}

        {/* bigger view / play — a field over the frame only, so the
            caption underneath stays freely editable */}
        {url !== null && !isAudio && (
          <button
            type="button"
            onClick={() => onOpen(url)}
            className="press media-hover absolute inset-0 flex items-center justify-center bg-transparent text-white/90 outline-none"
            aria-label={isVideo ? `Play ${item.name}` : `View ${item.name} bigger`}
          >
            {isVideo ? (
              <PlayDoodle className="media-zoom h-12 w-12" />
            ) : (
              <span className="sr-only">open bigger</span>
            )}
          </button>
        )}
      </div>

      {/* pencil caption — readable always, writable with the edit key */}
      <figcaption className="relative pt-1.5 pb-0.5">
        <input
          type="text"
          value={item.caption}
          onChange={(e) => onCaptionChange(e.target.value)}
          placeholder={locked ? "" : "(write about it…)"}
          readOnly={locked}
          maxLength={180}
          className="caption-input outline-none focus:underline focus:decoration-dashed focus:decoration-pencil-2 focus:underline-offset-4"
          aria-label={`Caption for ${item.name}`}
        />
      </figcaption>

      {/* un-tape — quiet pencil, red on hover; waits for the edit key */}
      {!locked && (
        <button
          type="button"
          onClick={onRemove}
          className="press absolute -top-1.5 -right-1.5 z-20 flex h-5 w-5 items-center justify-center rounded-full bg-page text-red-ink opacity-60 outline-none transition-opacity hover:opacity-100 focus-visible:opacity-100"
          aria-label={`Un-tape ${item.name}`}
          title="un-tape"
        >
          ✕
        </button>
      )}

      {/* the memories are moved by dragging them — with a finger or the
          mouse */}
    </figure>
  );
}
