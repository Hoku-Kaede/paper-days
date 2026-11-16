# Paper Days

*a diary, kept the scrapbook way.*

A personal diary site that looks — and behaves — like a real one: a kraft
cover with an elastic band on a wooden desk, cream ruled pages, ballpoint
ink, a red pen for the date, sticker doodles for the mood, and washi-taped
photos & videos with captions you write about each one.

## Run it

```bash
cd diary
npm install
npm run dev        # http://localhost:3000
```

## What's inside

- **Cover** — click the band; the cover swings open in 3D (respecting
  `prefers-reduced-motion`) to reveal the spread.
- **Index page** — a hand-drawn month calendar. Days you've written get a red
  ink circle; today gets a blue one. Recent scribbles listed underneath.
- **Sheet** — one page per date. Type on the ruled lines (the line-height and
  the drawn rules share one `--rule` value, so the ink always sits on the
  line), pick a mood sticker, autosaves as you write with a little
  `saved ✓` rubber stamp.
- **Memories** — tape in photos **and videos** (button or drag & drop) and
  write a caption under each one. Every photo gets a deterministic tilt and
  washi tape, decided by its id — the scrapbook never re-glues overnight.
- **Tear out** — scissors in the corner rips the page away, with a 7-second
  "paste it back" undo.
- **Close the diary** — the book fades back to the closed cover.

## Where your words live

Written pages and media blobs are stored in the browser's **IndexedDB**
(`paper-days` database), so everything is local and survives reloads.
If IndexedDB is unavailable the app falls back to an in-memory store —
writing still works, pictures won't stick.

## Stack

Next.js (App Router) · React 19 · Tailwind v4 · zero UI dependencies —
all doodles are hand-drawn inline SVG.
