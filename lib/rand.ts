/* Deterministic pseudo-randomness: the same photo/washi/tilt on every
   reload, because a scrapbook never re-glues its tape overnight. */

export function hashSeed(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Int in [min, max) from a string seed. */
export function spread(seed: string, min: number, max: number): number {
  return min + Math.floor(mulberry(hashSeed(seed))() * (max - min));
}

/** Small stable tilt in [-3.5, 3.5) degrees. */
export function tiltOf(seed: string): number {
  return (spread(seed, 0, 700) - 350) / 100;
}

export function pick<T extends string>(seed: string, options: Array<T>): T {
  return options[spread(seed, 0, options.length)] as T;
}

/** Short id for entries/media that is safe to use as an object key. */
export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  }
  return Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
}
