/* The cloud book: ONE diary, kept in the team's Upstash Redis (the
   KV_REST_* env vars arrive with the store connection). Every device
   opens the same pages. Writes stamp a revision counter, so readers
   poll just the counter and only redownload when something changed.

   Keys (all under the "pd:" namespace, shared politely with other
   projects on this store):
     pd:book:rev      — revision counter, INCR'd on every write
     pd:book:page:<date> — one page's JSON, keyed by date

   POST requires the keeper's phrase, checked server-side. */

const PAGE_PREFIX = "pd:book:page:";
const REV_KEY = "pd:book:rev";
const SETTINGS_KEY = "pd:book:settings";
const TOKEN_PREFIX = "pd:keeper:";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PAGE_BYTES = 900_000; // one written page with its small photos
const KEEPER_PHRASE = "amaze amaze amaze";

type PipelineResult = Array<{ result?: unknown; error?: string }>;

function kvEnv(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

async function kvPipeline(commands: unknown[][]): Promise<PipelineResult> {
  const env = kvEnv();
  if (!env) throw new Error("kv-not-connected");
  const res = await fetch(`${env.url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`kv-${res.status}`);
  return (await res.json()) as PipelineResult;
}

/** the keeper's token — handed out once, when the phrase was given */
export async function isKeeper(request: Request): Promise<boolean> {
  const token = (request.headers.get("x-keeper-token") ?? "").trim();
  if (!token) return false;
  try {
    const r = await kvPipeline([["GET", TOKEN_PREFIX + token]]);
    return r[0]?.result === "1";
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const wantsRev = new URL(request.url).searchParams.has("rev");
  try {
    if (wantsRev) {
      const r = await kvPipeline([["GET", REV_KEY]]);
      return Response.json(
        { rev: typeof r[0]?.result === "string" ? Number(r[0].result) : 0 },
        { headers: { "cache-control": "no-store" } },
      );
    }
    // full book: revision first, then every page
    const keys = await fetch(`${kvEnv()!.url}/keys/${encodeURIComponent(PAGE_PREFIX + "*")}`, {
      headers: { Authorization: `Bearer ${kvEnv()!.token}` },
    });
    if (!keys.ok) throw new Error(`kv-keys-${keys.status}`);
    const pageKeys = ((await keys.json()) as { result?: string[] }).result ?? [];
    const cmds: unknown[][] = [["GET", REV_KEY], ["GET", SETTINGS_KEY], ...pageKeys.map((k) => ["GET", k])];
    const r = await kvPipeline(cmds);
    const rev =
      typeof r[0]?.result === "string" ? Number(r[0].result) : r[0]?.result === 0 ? 0 : 0;
    const pages: Record<string, unknown> = {};
    let savedAt = 0;
    for (let i = 0; i < pageKeys.length; i++) {
      const raw = r[i + 2]?.result;
      if (typeof raw !== "string") continue;
      try {
        const parsed = JSON.parse(raw) as { date?: string; updatedAt?: number };
        const date =
          parsed.date ?? pageKeys[i].slice(PAGE_PREFIX.length);
        if (typeof date !== "string" || !DATE_RE.test(date)) continue;
        pages[date] = { ...parsed, date };
        if (typeof parsed.updatedAt === "number" && parsed.updatedAt > savedAt) {
          savedAt = parsed.updatedAt;
        }
      } catch {
        /* a broken page never takes the whole book down */
      }
    }
    // the book's own settings: which cover it wears, what's taped on it
    let settings: unknown = {};
    try {
      const raw = r[1]?.result;
      if (typeof raw === "string") settings = JSON.parse(raw);
    } catch {
      settings = {};
    }
    return Response.json(
      { rev, savedAt, pages, settings },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: {
    unlock?: string;
    page?: { date?: string } | null;
    delete?: string;
    settings?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "bad-json" }, { status: 400 });
  }

  // unlocking: the phrase is checked here, on the server, and never
  // travels to the browser again — the keeper gets a token instead
  if (typeof body.unlock === "string") {
    const said = body.unlock.trim().replace(/\s+/g, " ").toLowerCase();
    if (said !== KEEPER_PHRASE) {
      return Response.json({ error: "no-key" }, { status: 401 });
    }
    const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
    await kvPipeline([["SET", TOKEN_PREFIX + token, "1", "EX", 60 * 60 * 24 * 30]]);
    return Response.json({ ok: true, token });
  }

  // every other write needs the keeper's token
  if (!(await isKeeper(request))) {
    return Response.json({ error: "no-key" }, { status: 401 });
  }

  try {
    if (body.settings !== undefined) {
      const payload = JSON.stringify(body.settings);
      if (payload.length > 200_000) {
        return Response.json({ error: "too-big" }, { status: 413 });
      }
      await kvPipeline([["SET", SETTINGS_KEY, payload]]);
      return Response.json({ ok: true });
    }

    if (typeof body.delete === "string") {
      if (!DATE_RE.test(body.delete)) {
        return Response.json({ error: "bad-date" }, { status: 400 });
      }
      const r = await kvPipeline([["DEL", PAGE_PREFIX + body.delete], ["INCR", REV_KEY]]);
      return Response.json({ ok: true, rev: Number(r[1]?.result ?? 0) });
    }

    const page = body.page;
    if (!page || typeof page !== "object" || typeof page.date !== "string") {
      return Response.json({ error: "no-page" }, { status: 400 });
    }
    if (!DATE_RE.test(page.date)) {
      return Response.json({ error: "bad-date" }, { status: 400 });
    }
    const payload = JSON.stringify(page);
    if (payload.length > MAX_PAGE_BYTES) {
      return Response.json({ error: "too-big" }, { status: 413 });
    }
    const r = await kvPipeline([
      ["SET", PAGE_PREFIX + page.date, payload],
      ["INCR", REV_KEY],
    ]);
    return Response.json({ ok: true, rev: Number(r[1]?.result ?? 0) });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
