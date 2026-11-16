/* Hand-drawn SVG doodads — every stroke drawn like a pen, round caps,
   wobbling paths, all inheriting currentColor so ink rules apply. */

type ArtProps = { className?: string };

function Stroke({ className, children, viewBox = "0 0 64 64", preserveAspectRatio = "xMidYMid meet" }: ArtProps & {
  children: React.ReactNode;
  viewBox?: string;
  preserveAspectRatio?: string;
}) {
  return (
    <svg
      viewBox={viewBox}
      className={className}
      preserveAspectRatio={preserveAspectRatio}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function Sun({ className }: ArtProps) {
  return (
    <Stroke className={className}>
      <circle cx="32" cy="32" r="12.5" />
      <path d="M32 13.5v-4.7M44.5 18.5l3.3-3.5M50.5 32h4.6M44.9 45.5l3.4 3.3M31.8 50.6v4.5M18.7 45.3l-3.4 3.4M13 32.2H8.4M18.3 18.6L15 15.2" strokeWidth="2.2" />
    </Stroke>
  );
}

export function Cloud({ className }: ArtProps) {
  return (
    <Stroke className={className}>
      <path d="M17 45 Q8 45 8 37.5 Q8 29.5 16 29.5 Q16.5 19 26.5 19 Q35 19 36.5 26.5 Q44 22.5 48.5 29.5 Q53.5 30.5 53.5 37.5 Q53.5 45 45.5 45 Z" />
    </Stroke>
  );
}

export function Rain({ className }: ArtProps) {
  return (
    <Stroke className={className}>
      <path d="M18 40 Q9 40 9 32.5 Q9 25 17 25 Q17.5 14.5 27 14.5 Q35.5 14.5 37 22 Q44.5 18 49 25 Q54 26 54 32.5 Q54 40 46 40 Z" />
      <path d="M23 46l-2.8 8.4M33 48l-2.8 8.4M43 46l-2.8 8.4" strokeWidth="2.2" />
    </Stroke>
  );
}

export function Storm({ className }: ArtProps) {
  return (
    <Stroke className={className}>
      <path d="M18 38 Q9 38 9 30.5 Q9 23 17 23 Q17.5 12.5 27 12.5 Q35.5 12.5 37 20 Q44.5 16 49 23 Q54 24 54 30.5 Q54 38 46 38 Z" />
      <path d="M35 42l-7 9h7.5l-5.4 9.6" strokeWidth="2.3" />
    </Stroke>
  );
}

export function Heart({ className }: ArtProps) {
  return (
    <Stroke className={className}>
      <path d="M32 51.5 C24 45 12.5 37.5 12.5 26 C12.5 18 18.5 13 24.8 15.2 C28.7 16.6 30.9 19.8 32 22.8 C33.1 19.8 35.3 16.6 39.2 15.2 C45.5 13 51.5 18 51.5 26 C51.5 37.5 40 45 32 51.5 Z" />
    </Stroke>
  );
}

export function Star({ className }: ArtProps) {
  return (
    <Stroke className={className}>
      <path d="M32 11.5l5 12.9 13.6 1 -10.5 8.8 3.6 13.3 -11.7-7.2 -11.7 7.2 3.6-13.3 -10.5-8.8 13.6-1 Z" />
    </Stroke>
  );
}

export function Coffee({ className }: ArtProps) {
  return (
    <Stroke className={className}>
      <path d="M20 30.5h23.5v9.5q0 8.5-11.7 8.5t-11.8-8.5 Z" />
      <path d="M43.5 33.5q7.5.5 6.5 6t-8 4.5" />
      <path d="M26.5 24.5q2.6-4 0-8.5" strokeWidth="2" />
      <path d="M34.5 24.5q2.6-4 0-8.5" strokeWidth="2" />
    </Stroke>
  );
}

export function Smile({ className }: ArtProps) {
  return (
    <Stroke className={className}>
      <circle cx="32" cy="32" r="17.5" />
      <circle cx="25.5" cy="27.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="38.5" cy="27.5" r="1" fill="currentColor" stroke="none" />
      <path d="M24.5 37q7.5 6 15 0" />
    </Stroke>
  );
}

export function ArrowCurved({ className }: ArtProps) {
  return (
    <Stroke className={className} viewBox="0 0 64 48">
      <path d="M6 40 Q30 38 55 12" strokeWidth="2.6" />
      <path d="M46.5 12.5l8.7-.4 -1.2 8.6" strokeWidth="2.6" />
    </Stroke>
  );
}

export function PlayDoodle({ className }: ArtProps) {
  return (
    <Stroke className={className}>
      <path d="M33 15.5C42 16 50 23 49.5 32.5 49 42 41 49.5 32 49 22.5 48.5 15 41 15.5 31.5 16 22 24 15 33 15.5Z" strokeWidth="2.6" />
      <path d="M27.5 24.5l13 8-13 8.5Z" fill="currentColor" stroke="none" />
    </Stroke>
  );
}

export function Paperclip({ className }: ArtProps) {
  return (
    <Stroke className={className} viewBox="0 0 26 46">
      <path d="M17 5L10.5 5a4.5 4.5 0 0 0-4.5 4.5l-.2 27a7 7 0 0 0 7 7h4.4a7 7 0 0 0 7-7V11.5a5.5 5.5 0 0 0-5.5-5.5h-1.9a5.5 5.5 0 0 0-5.5 5.5l.3 20" strokeWidth="2" />
    </Stroke>
  );
}

export function CoffeeStain({ className }: ArtProps) {
  return (
    <Stroke className={className} viewBox="0 0 90 90">
      <g stroke="#8a5a33" strokeOpacity="0.4">
        <path d="M46 13C64 11 80 23 78 42 76 62 57 77 39 74 21 71 8 57 12 39 15 25 29 14.5 46 13Z" strokeWidth="2.6" />
        <path d="M50 22C62 21 72 30 70 41 68 54 54 64 41 61 28 58 20 47 24 36 27 27 39 23 50 22Z" strokeWidth="1.6" strokeOpacity="0.55" />
        <ellipse cx="71" cy="20" rx="2.6" ry="2" strokeWidth="1.4" strokeOpacity="0.6" />
        <ellipse cx="18" cy="71" rx="2" ry="1.7" strokeWidth="1.2" strokeOpacity="0.5" />
      </g>
    </Stroke>
  );
}

export function InkCircle({ className }: ArtProps) {
  return (
    <Stroke className={className}>
      <path
        d="M11 34C10 18 27 9.5 37 9.5 50 9.5 58.5 19 57.5 30.5 56.5 46 43.5 54.5 29.5 54 18 53.6 7 48.5 8 37.2 8.8 27 19 19.5 28 16.5"
        strokeWidth="2.8"
      />
    </Stroke>
  );
}

export function UnderlineStroke({ className }: ArtProps) {
  return (
    <Stroke className={className} viewBox="0 0 200 14" preserveAspectRatio="none">
      <path d="M4 9C42 3 96 10.5 196 5" strokeWidth="2.6" strokeOpacity="0.85" />
      <path d="M8 11.5C56 7 132 12.5 184 8.5" strokeWidth="2" strokeOpacity="0.5" />
    </Stroke>
  );
}

/** "today" useless arrow doodles for the pencil notes */
export function Squiggle({ className }: ArtProps) {
  return (
    <Stroke className={className} viewBox="0 0 48 14" preserveAspectRatio="none">
      <path d="M2 8q5-7 10 0t10 0 10 0 10 0" strokeWidth="2.2" />
    </Stroke>
  );
}

/* One doodle per mood sticker; keyed so the sheet can save "sun" etc. */
export const DOODLES = ["sun", "cloud", "rain", "storm", "heart", "star", "coffee"] as const;
export type DoodleKey = (typeof DOODLES)[number];

export const DOODLE_ART: Record<DoodleKey, React.ComponentType<ArtProps>> = {
  sun: Sun,
  cloud: Cloud,
  rain: Rain,
  storm: Storm,
  heart: Heart,
  star: Star,
  coffee: Coffee,
};

export const DOODLE_NAMES: Record<DoodleKey, string> = {
  sun: "Sunny",
  cloud: "Cloudy",
  rain: "Raining",
  storm: "Stormy",
  heart: "Lots of love",
  star: "A little bit of magic",
  coffee: "Coffee helped",
};
