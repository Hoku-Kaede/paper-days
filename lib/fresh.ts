/* "Just taped in" — the small window after a photo is added, so the
   picture can do its one-time "developing" fade when it lands on the
   page. Turn to that page later and the photo is simply there: a
   half-second of a washed-out print reads as the picture going dark,
   not as newness. */

const fresh = new Map<string, number>(); // media id -> when it was taped
const faded = new Set<string>(); // ids whose one fade already played
const FRESH_MS = 8000;

export function markFresh(id: string): void {
  fresh.set(id, Date.now());
  if (fresh.size > 200) {
    const oldest = [...fresh.entries()].sort((a, b) => a[1] - b[1])[0];
    if (oldest) fresh.delete(oldest[0]);
  }
}

/** may this picture still do its one fade? */
export function isFresh(id: string): boolean {
  if (faded.has(id)) return false;
  const at = fresh.get(id);
  if (at === undefined) return false;
  if (Date.now() - at > FRESH_MS) {
    fresh.delete(id);
    return false;
  }
  return true;
}

/** the fade has played — never again for this picture */
export function markFaded(id: string): void {
  faded.add(id);
  fresh.delete(id);
  if (faded.size > 400) {
    const oldest = faded.values().next().value;
    if (oldest !== undefined) faded.delete(oldest);
  }
}
