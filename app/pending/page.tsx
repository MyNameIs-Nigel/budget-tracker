import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { getUser } from "@/lib/dal";
import { Brand } from "@/components/Icon";
import UserMenu from "@/components/UserMenu";
import Loading from "@/components/Loading";
async function Pending() {
  const u = await getUser();
  if (!u) redirect("/");
  if (!u.disabled) redirect("/budget");
  return (
    <>
      <header className="app-header">
        <div className="header-inner">
          <Brand />
          <UserMenu user={u} />
        </div>
      </header>
      <main id="main" className="pending-page">
        <span className="pending-icon">
          <LockKeyhole size={28} />
        </span>
        <p className="eyebrow">A private space</p>
        <h1>You’re on the list.</h1>
        <p className="muted">
          Your account is waiting for approval.
          <br />
          Please ask the admin to activate your access.
        </p>
        <p className="small muted">Signed in as {u.email}</p>
        <Link href="/budget" className="btn primary">
          Check access again
        </Link>
      </main>
    </>
  );
}
export default function Page() {
  return (
    <Suspense fallback={<Loading label="Checking your access…" />}>
      <Pending />
    </Suspense>
  );
}
