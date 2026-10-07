import "server-only";
import { z } from "zod";
import { unstable_rethrow } from "next/navigation";
import { getUser } from "./dal";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function apiUser(admin = false) {
  const u = await getUser();
  if (!u) throw new HttpError(401, "Please sign in.");
  if (u.disabled)
    throw new HttpError(403, "Your account is waiting for admin approval.");
  if (admin && !u.admin) throw new HttpError(403, "Admin access required.");
  return u;
}
export function sameOrigin(req: Request) {
  if (req.headers.get("origin") !== new URL(req.url).origin)
    throw new HttpError(403, "Request origin is not allowed.");
}
export async function body<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  if (!req.headers.get("content-type")?.startsWith("application/json"))
    throw new HttpError(415, "Send JSON.");
  const raw = await req.text();
  if (raw.length > 200_000) throw new HttpError(413, "This file is too large.");
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new HttpError(400, "Invalid JSON.");
  }
  const result = schema.safeParse(value);
  if (!result.success)
    throw new HttpError(
      400,
      result.error.issues[0]?.message ?? "Invalid input.",
    );
  return result.data;
}
export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
export async function handle(fn: () => Promise<Response>) {
  try {
    return await fn();
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof HttpError) return json({ message: e.message }, e.status);
    console.error(
      "Budget request failed",
      e instanceof Error ? e.name : "UnknownError",
    );
    return json(
      { message: "Could not complete this request. Please try again." },
      500,
    );
  }
}
