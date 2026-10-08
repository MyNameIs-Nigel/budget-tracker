import type { Metadata } from "next";
import { privateRobots } from "@/lib/seo";
import { Suspense } from "react";
import { requireUser } from "@/lib/dal";
import { getPlan, getTransactions } from "@/lib/store";
import { isLocalTestMode } from "@/lib/access";
import Dashboard from "@/components/Dashboard";
import Loading from "@/components/Loading";
export const metadata: Metadata = {
  title: "Your budget",
  robots: privateRobots,
};

async function Budget() {
  const u = await requireUser();
  const [p, tx] = await Promise.all([getPlan(u.id), getTransactions(u.id)]);
  return (
    <Dashboard
      user={u}
      initialPlan={p.data}
      revision={p.revision}
      initialTransactions={tx}
      testMode={isLocalTestMode()}
    />
  );
}
export default function Page() {
  return (
    <Suspense fallback={<Loading label="Gathering your budget…" />}>
      <Budget />
    </Suspense>
  );
}
