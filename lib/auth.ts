"use client";

/* The edit gate. Reading the diary is free; picking up the pen asks for
   the keeper's phrase. The phrase itself never comes to the browser —
   the server checks it and hands back a token that lives only in this
   tab's session. Unlocked state lives in this browser tab only: a fresh
   visit starts with the pen resting. */

const KEY = "paper-days-edit-key";
const TOKEN_KEY = "paper-days-keeper-token";

/** Unlocked for this tab's session? */
export function readUnlocked(): boolean {
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function storeUnlocked(): void {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    /* private mode — session stays in memory */
  }
}

export function clearUnlocked(): void {
  try {
    sessionStorage.removeItem(KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* nothing to un-store */
  }
}

/** the keeper's token — sent with every write */
export function keeperToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/** ask the server whether that was the phrase; it answers with a token */
export async function unlockWithPhrase(phrase: string): Promise<boolean> {
  try {
    const res = await fetch("/api/keeper", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unlock: phrase }),
    });
    if (!res.ok) return false;
    const j = (await res.json()) as { ok?: boolean; token?: string };
    if (!j || j.ok !== true || typeof j.token !== "string") return false;
    try {
      sessionStorage.setItem(TOKEN_KEY, j.token);
    } catch {
      /* private mode — the token lives in memory only */
    }
    return true;
  } catch {
    return false;
  }
}
