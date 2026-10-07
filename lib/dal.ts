import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { user } from "@/db/schema";
import { auth } from "./auth";
import { configuredAdmin } from "./access";

export const getUser = cache(async () => {
  const result = await auth.api.getSession({ headers: await headers() });
  if (!result) return null;
  // Always re-read access state, including for an already-issued session.
  const [current] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      disabled: user.disabled,
    })
    .from(user)
    .where(eq(user.id, result.user.id));
  return current ? { ...current, admin: configuredAdmin(current.email) } : null;
});
export type AppUser = NonNullable<Awaited<ReturnType<typeof getUser>>>;
export async function requireUser() {
  const u = await getUser();
  if (!u) redirect("/");
  if (u.disabled) redirect("/pending");
  return u;
}
export async function requireAdmin() {
  const u = await requireUser();
  if (!u.admin) notFound();
  return u;
}
