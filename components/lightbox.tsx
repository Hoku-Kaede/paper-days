"use client";

/* The big look at a taped memory. Modal — same rule as other modals:
   originates centered, dark desk behind, closes the way it opened. */

import type React from "react";
import { useEffect, useRef } from "react";
import type { MediaItem } from "@/lib/db";

export function Lightbox({
  item,
  url,
  onClose,
}: {
  item: MediaItem | null;
  url: string | null;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const shown = item !== null && url !== null;

  // a video should start playing the moment you ask for it — the tap
  // that opened it is the gesture the browser wants
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (!shown) return;
    const v = videoRef.current;
    if (!v) return;
    const start = () => {
      v.play().catch(() => {
        /* the browser held off — the play button is right there */
      });
    };
    if (v.readyState >= 2) start();
    else v.addEventListener("loadeddata", start, { once: true });
    return () => v.removeEventListener("loadeddata", start);
  }, [shown, url]);

  useEffect(() => {
    if (!shown) return undefined;
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    document.documentElement.style.overflow = "hidden";

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "Tab") {
        // keep focus inside the panel
        const inside =
          panelRef.current &&
          e.target instanceof Node &&
          panelRef.current.contains(e.target);
        if (!inside && panelRef.current) {
          e.preventDefault();
          (e.shiftKey
            ? panelRef.current.querySelector<HTMLElement>("video, [data-lightbox-media]")
            : closeRef.current
          )?.focus();
        }
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.documentElement.style.overflow = "";
      opener?.focus?.();
    };
  }, [shown, onClose]);

  if (!shown) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={`Looking at ${item.name}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{ background: "rgba(28,19,10,0.78)", backdropFilter: "blur(3px)" }}
    >
      <div
        ref={panelRef}
        className="pop photo relative max-w-[min(92vw,1100px)]"
        style={{ "--tilt": "0deg", transform: "none" } as React.CSSProperties}
      >
        <div className="ph-frame max-h-[74dvh]">
          {item.kind === "audio" ? (
            <div className="flex flex-col items-center gap-3 px-4 py-6">
              <span className="font-note text-[1.2rem] text-pencil-2">♪ a voice note</span>
              <audio
                src={url}
                controls
                autoPlay
                className="w-[min(80vw,26rem)]"
                aria-label={`voice note: ${item.name}`}
              />
            </div>
          ) : item.kind === "video" ? (
            <video
              ref={videoRef}
              src={url}
              controls
              autoPlay
              playsInline
              className="max-h-[74dvh] w-auto max-w-[88vw] object-contain"
              aria-label={`video: ${item.name}`}
            />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element -- user's own blob */
            <img
              src={url}
              alt={item.caption || item.name}
              className="max-h-[74dvh] w-auto max-w-[88vw] object-contain"
              draggable={false}
            />
          )}
        </div>
        {item.caption.trim().length > 0 && (
          <figcaption className="caption-input pb-1 pt-2 text-center">
            {item.caption}
          </figcaption>
        )}

        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="press absolute -top-3.5 -right-3.5 flex h-9 w-9 items-center justify-center rounded-full border-2 border-pencil/60 bg-page-2 font-hand text-xl text-pencil outline-none hover:border-red-ink hover:text-red-ink"
          aria-label="Close the look"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
