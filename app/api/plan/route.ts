import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { plans } from "@/db/schema";
import { planSchema } from "@/lib/budget";
import { apiUser, body, handle, HttpError, json, sameOrigin } from "@/lib/http";
import { getPlan } from "@/lib/store";

export function GET() {
  return handle(async () => {
    const u = await apiUser();
    const p = await getPlan(u.id);
    return json({ plan: p.data, revision: p.revision });
  });
}
export function PUT(req: Request) {
  return handle(async () => {
    sameOrigin(req);
    const u = await apiUser();
    const value = await body(
      req,
      z.object({ plan: planSchema, revision: z.number().int().min(0) }),
    );
    await getPlan(u.id);
    const [p] = await db
      .update(plans)
      .set({
        data: value.plan,
        revision: sql`${plans.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(plans.userId, u.id), eq(plans.revision, value.revision)))
      .returning({ revision: plans.revision });
    if (!p)
      throw new HttpError(
        409,
        "Your budget changed in another tab. Export your edits, then reload before saving.",
      );
    return json(p);
  });
}
