import type { Metadata } from "next";
import { privateRobots } from "@/lib/seo";
import { Suspense } from "react";
import Link from "next/link";
import { desc } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db/client";
import { user } from "@/db/schema";
import { requireAdmin } from "@/lib/dal";
import { configuredAdmin } from "@/lib/access";
import { Brand } from "@/components/Icon";
import UserMenu from "@/components/UserMenu";
import Loading from "@/components/Loading";
import AdminUsers from "@/components/AdminUsers";
export const metadata: Metadata = {
  title: "Manage access",
  robots: privateRobots,
};

async function Admin() {
  const u = await requireAdmin();
  const users = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      disabled: user.disabled,
    })
    .from(user)
    .orderBy(desc(user.createdAt));
  return (
    <>
      <header className="app-header">
        <div className="header-inner">
          <Brand />
          <Link href="/budget" className="text-btn">
            <ArrowLeft size={15} />
            Back to budget
          </Link>
          <UserMenu user={u} />
        </div>
      </header>
      <main id="main" className="dashboard">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Admin</p>
            <h1>A private space, by invitation.</h1>
            <p className="muted">
              Review new accounts and manage who can use the app.
            </p>
          </div>
        </div>
        <AdminUsers
          initialUsers={users.map((x) => ({
            ...x,
            admin: configuredAdmin(x.email),
          }))}
        />
      </main>
    </>
  );
}
export default function Page() {
  return (
    <Suspense fallback={<Loading label="Checking admin access…" />}>
      <Admin />
    </Suspense>
  );
}
