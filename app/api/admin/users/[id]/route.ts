import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { user } from "@/db/schema";
import { configuredAdmin } from "@/lib/access";
import { apiUser, body, handle, HttpError, json, sameOrigin } from "@/lib/http";
type Context = { params: Promise<{ id: string }> };
export function PATCH(req: Request, ctx: Context) {
  return handle(async () => {
    sameOrigin(req);
    const admin = await apiUser(true),
      { id } = await ctx.params;
    const value = await body(req, z.object({ disabled: z.boolean() }));
    const [target] = await db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, id));
    if (!target) throw new HttpError(404, "Account not found.");
    if (id === admin.id || configuredAdmin(target.email))
      throw new HttpError(400, "Configured admins cannot be disabled here.");
    await db
      .update(user)
      .set({ disabled: value.disabled, updatedAt: new Date() })
      .where(eq(user.id, id));
    return json({ ok: true });
  });
}
