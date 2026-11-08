// fetchText with a fake fetch and a throwaway cache folder: no network, real .cache/ untouched.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { configureHttp, fetchJson, fetchText, setFresh, stats, USER_AGENT } from "@/scripts/lib/http";

const realFetch = globalThis.fetch;
let dir: string;
let calls: { url: string; init?: RequestInit }[] = [];
let replies: (() => Response)[] = [];

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "clans-http-"));
  configureHttp({ cacheDir: dir, delayMs: 0 });
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const next = replies.shift();
    if (!next) throw new Error(`unexpected request to ${url}`);
    return next();
  }) as typeof fetch;
});

afterAll(async () => {
  globalThis.fetch = realFetch;
  configureHttp({ cacheDir: path.resolve(process.cwd(), ".cache"), delayMs: 1000 });
  setFresh(false);
  await rm(dir, { recursive: true, force: true });
});

beforeEach(() => {
  calls = [];
  replies = [];
  setFresh(false);
});

const ok = (body: string) => () => new Response(body, { status: 200 });

describe("fetchText", () => {
  test("fetches once, then serves from the cache", async () => {
    replies = [ok("hello")];
    const before = { ...stats };
    expect(await fetchText({ url: "https://example.test/a" })).toBe("hello");
    expect(await fetchText({ url: "https://example.test/a" })).toBe("hello");
    expect(calls).toHaveLength(1);
    expect(stats.network - before.network).toBe(1);
    expect(stats.cached - before.cached).toBe(1);
    expect((await readdir(dir)).length).toBeGreaterThan(0);
  });

  test("sends the User-Agent and the request method/body", async () => {
    replies = [ok("posted")];
    await fetchText({ url: "https://example.test/post", method: "POST", body: "q=1", headers: { Accept: "x" } });
    const init = calls[0].init!;
    expect(init.method).toBe("POST");
    expect(init.body).toBe("q=1");
    expect(init.headers).toMatchObject({ "User-Agent": USER_AGENT, "Api-User-Agent": USER_AGENT, Accept: "x" });
  });

  test("the body is part of the cache key", async () => {
    replies = [ok("one"), ok("two")];
    expect(await fetchText({ url: "https://example.test/q", method: "POST", body: "1" })).toBe("one");
    expect(await fetchText({ url: "https://example.test/q", method: "POST", body: "2" })).toBe("two");
  });

  test("fresh mode skips cache reads but still writes", async () => {
    replies = [ok("old")];
    await fetchText({ url: "https://example.test/fresh" });
    setFresh(true);
    replies = [ok("new")];
    expect(await fetchText({ url: "https://example.test/fresh" })).toBe("new");
    setFresh(false);
    expect(await fetchText({ url: "https://example.test/fresh" })).toBe("new");
  });

  test("does not retry a 404", async () => {
    replies = [() => new Response("nope", { status: 404, statusText: "Not Found" })];
    expect(fetchText({ url: "https://example.test/missing" })).rejects.toThrow(/Request failed.*404 Not Found: nope/);
  });

  test("retries a 503, honouring Retry-After", async () => {
    replies = [() => new Response("busy", { status: 503, headers: { "Retry-After": "1" } }), ok("finally")];
    const start = Date.now();
    expect(await fetchText({ url: "https://example.test/busy" })).toBe("finally");
    expect(calls).toHaveLength(2);
    expect(Date.now() - start).toBeGreaterThanOrEqual(900);
  });
});

describe("fetchJson", () => {
  test("parses the body", async () => {
    replies = [ok('{"a":[1,2]}')];
    expect(await fetchJson<{ a: number[] }>({ url: "https://example.test/json" })).toEqual({ a: [1, 2] });
  });
});
