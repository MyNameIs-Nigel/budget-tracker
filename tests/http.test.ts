import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ getUser: vi.fn() }));
import { body, handle } from "@/lib/http";

function request(text: string, contentType = "application/json") {
  return new Request("http://localhost/api/plan", {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: text,
  });
}

describe("JSON request boundaries", () => {
  it("accepts the exact byte limit and decodes UTF-8 split between chunks", async () => {
    const exact = "x".repeat(199_998);
    await expect(
      body(request(JSON.stringify(exact)), z.string()),
    ).resolves.toBe(exact);
    const bytes = new TextEncoder().encode('"é"');
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(bytes.slice(0, 2));
        controller.enqueue(bytes.slice(2));
        controller.close();
      },
    });
    const req = new Request("http://localhost/api/plan", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: stream,
      duplex: "half",
    } as RequestInit);
    await expect(body(req, z.string())).resolves.toBe("é");
  });

  it("rejects an oversized declared length before parsing", async () => {
    const req = request("{}");
    req.headers.set("Content-Length", "200001");
    await expect(body(req, z.unknown())).rejects.toMatchObject({ status: 413 });
  });

  it("limits UTF-8 bytes rather than JavaScript string length", async () => {
    const response = await handle(async () =>
      Response.json(
        await body(request(JSON.stringify("é".repeat(100_000))), z.string()),
      ),
    );
    expect(response.status).toBe(413);
  });

  it("stops and cancels a streamed body as soon as it exceeds the limit", async () => {
    const cancel = vi.fn();
    let reads = 0;
    const stream = new ReadableStream({
      pull(controller) {
        reads++;
        if (reads > 4) throw new Error("Read past the size limit");
        controller.enqueue(new Uint8Array(100_001));
      },
      cancel,
    });
    const req = new Request("http://localhost/api/plan", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: stream,
      duplex: "half",
    } as RequestInit);
    await expect(body(req, z.unknown())).rejects.toMatchObject({ status: 413 });
    expect(cancel).toHaveBeenCalledOnce();
    expect(reads).toBeLessThanOrEqual(3);
  });

  it("accepts JSON with charset parameters but rejects lookalike media types", async () => {
    await expect(
      body(
        request('{"ok":true}', "application/json; charset=utf-8"),
        z.object({ ok: z.boolean() }),
      ),
    ).resolves.toEqual({ ok: true });
    await expect(
      body(request("{}", "application/jsonp"), z.unknown()),
    ).rejects.toMatchObject({ status: 415 });
  });

  it("returns clear errors for malformed JSON and invalid input", async () => {
    await expect(body(request("{"), z.unknown())).rejects.toMatchObject({
      status: 400,
      message: "Invalid JSON.",
    });
    await expect(
      body(request("{}"), z.object({ ok: z.boolean() })),
    ).rejects.toMatchObject({ status: 400 });
  });
});
