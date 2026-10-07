import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { isLocalTestMode } from "@/lib/access";
import { body, handle, sameOrigin } from "@/lib/http";
export function POST(req: Request) {
  if (!isLocalTestMode()) return new Response(null, { status: 404 });
  return handle(async () => {
    sameOrigin(req);
    const { who } = await body(
      req,
      z.object({ who: z.enum(["owner", "guest", "other"]) }),
    );
    const email = `${who}@budget.test`,
      password = "local-fake-account-only-12345";
    const [existing] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email));
    if (!existing)
      await auth.api.signUpEmail({
        body: {
          name:
            who === "owner"
              ? "Local Owner"
              : who === "guest"
                ? "Jamie Example"
                : "Morgan Example",
          email,
          password,
        },
        headers: req.headers,
      });
    return auth.api.signInEmail({
      body: { email, password },
      headers: req.headers,
      asResponse: true,
    });
  });
}
