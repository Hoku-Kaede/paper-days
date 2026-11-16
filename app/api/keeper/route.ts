/* the server-side keeper: no passphrase in the bundle */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PHRASE = "amaze amaze amaze";
const TOKENS = "pd:keeper:";

/** the keeper's phrase → a token that lives only on their device */
export async function POST(request: Request) {
  let body: { unlock?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad-json" }, { status: 400 });
  }
  const said = (body.unlock ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  if (said !== PHRASE) {
    return NextResponse.json({ error: "no-key" }, { status: 401 });
  }
  const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
  const env = {
    url: process.env.KV_REST_API_URL?.replace(/\/$/, ""),
    token: process.env.KV_REST_API_TOKEN,
  };
  if (env.url && env.token) {
    await fetch(`${env.url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.token}`, "Content-Type": "application/json" },
      body: JSON.stringify([["SET", TOKENS + token, "1", "EX", 60 * 60 * 24 * 30]]),
    }).catch(() => null);
  }
  return NextResponse.json({ ok: true, token });
}
