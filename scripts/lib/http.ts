// Polite, cached HTTP for the data script.
// - one request at a time, ~1s apart
// - retries 429/5xx with exponential backoff (honours Retry-After)
// - raw responses cached in .cache/ ; --fresh skips cache reads (still writes)

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const USER_AGENT = "clans-site/0.1 (https://github.com/Mooshay105/clans)";
const CACHE_DIR = path.resolve(process.cwd(), ".cache");
const DELAY_MS = 1000;
const MAX_RETRIES = 6;

let fresh = false;
let lastRequest = 0;
export const stats = { network: 0, cached: 0 };

export function setFresh(value: boolean) {
  fresh = value;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function cacheFile(key: string) {
  const hash = createHash("sha256").update(key).digest("hex").slice(0, 32);
  return path.join(CACHE_DIR, `${hash}.txt`);
}

type Req = { url: string; method?: "GET" | "POST"; body?: string; headers?: Record<string, string> };

export async function fetchText(req: Req): Promise<string> {
  const key = JSON.stringify([req.method ?? "GET", req.url, req.body ?? ""]);
  const file = cacheFile(key);
  if (!fresh) {
    try {
      const hit = await readFile(file, "utf8");
      stats.cached++;
      return hit;
    } catch {
      /* miss */
    }
  }

  for (let attempt = 0; ; attempt++) {
    const wait = lastRequest + DELAY_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();
    stats.network++;

    let res: Response | undefined;
    let error: unknown;
    try {
      res = await fetch(req.url, {
        method: req.method ?? "GET",
        body: req.body,
        headers: { "User-Agent": USER_AGENT, "Api-User-Agent": USER_AGENT, ...req.headers },
      });
    } catch (e) {
      error = e;
    }

    if (res && res.ok) {
      const text = await res.text();
      await mkdir(CACHE_DIR, { recursive: true });
      await writeFile(file, text);
      return text;
    }

    const retryable = !res || res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= MAX_RETRIES) {
      const detail = res ? `${res.status} ${res.statusText}: ${(await res.text()).slice(0, 300)}` : String(error);
      throw new Error(`Request failed (${req.url.slice(0, 200)}): ${detail}`);
    }
    const retryAfter = Number(res?.headers.get("retry-after"));
    const backoff = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * 2 ** attempt;
    console.warn(`  ${res ? res.status : "network error"}; retrying in ${Math.round(backoff / 1000)}s…`);
    await sleep(backoff);
  }
}

export async function fetchJson<T>(req: Req): Promise<T> {
  return JSON.parse(await fetchText(req)) as T;
}
