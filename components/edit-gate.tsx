"use client";

/* The edit gate: a paper scrap demanding the keeper's phrase. Reading is
   free — this only opens when someone reaches for the pen. */

import { type FormEvent, useEffect, useRef, useState } from "react";
import { unlockWithPhrase } from "@/lib/auth";

export function EditGate({
  onClose,
  onUnlock,
}: {
  onClose: () => void;
  onUnlock: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pass, setPass] = useState("");
  const [wrong, setWrong] = useState(false);
  const [shaking, setShaking] = useState(false);

  // the scrap asks politely for focus and holds the page still
  useEffect(() => {
    inputRef.current?.focus();
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, []);

  // Escape closes the gate before it can reach the diary
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" && e.key !== "Tab") return;
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      // Tab: kept inside the scrap, like the lightbox does
      const inside =
        panelRef.current && e.target instanceof Node && panelRef.current.contains(e.target);
      if (!inside && panelRef.current) {
        e.preventDefault();
        (e.shiftKey
          ? (panelRef.current.querySelector<HTMLElement>("button") ?? inputRef.current)
          : inputRef.current
        )?.focus();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // the phrase is checked on the server — it never travels to the browser
    const good = await unlockWithPhrase(pass);
    if (good) {
      onUnlock();
      return;
    }
    if (shaking) return;
    setWrong(true);
    setShaking(true); // replayed by onAnimationEnd below
    setPass("");
  }

  function settle() {
    if (!shaking) return;
    setShaking(false);
    inputRef.current?.focus();
  }

  return (
    <div
      data-edit-gate
      className="gate-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="The diary's edit key"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={`gate-scrap ${shaking ? "shake" : ""}`}
        onAnimationEnd={settle}
      >
        <p className="text-center font-hand text-[1.7rem] leading-tight font-bold text-ink-strong">
          edit key
        </p>
        <p className="pt-1.5 text-center font-note text-[1rem] leading-snug text-pencil">
          the pages read happily on their own —
          <br />
          the pen asks for the keeper's phrase
        </p>

        <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
          <input
            ref={inputRef}
            type="password"
            value={pass}
            onChange={(e) => {
              setPass(e.target.value);
              if (wrong) setWrong(false);
            }}
            placeholder="(the keeper's phrase)"
            aria-label="Edit passphrase"
            autoComplete="off"
            spellCheck={false}
            className="gate-input"
          />
          {wrong && (
            <p className="text-center font-note text-[1rem] text-red-ink" role="status">
              (hmm — that's not it…)
            </p>
          )}
          <div className="mt-1 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="press font-hand text-[1.15rem] leading-none text-pencil-2 outline-none transition-colors hover:text-pencil"
            >
              leave it
            </button>
            <button
              type="submit"
              className="press scribble font-hand text-[1.25rem] leading-none font-semibold text-red-ink outline-none"
            >
              unlock
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
