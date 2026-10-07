"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { authClient } from "@/lib/auth-client";
export default function SignIn({
  google,
  testMode,
}: {
  google: boolean;
  testMode: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const router = useRouter();
  async function local(who: string) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/e2e/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ who }),
      });
      if (!r.ok) throw new Error();
      router.push("/budget");
      router.refresh();
    } catch {
      setError(
        "Could not sign in. Check that your local database is running and migrated.",
      );
      setBusy(false);
    }
  }
  return (
    <div className="sign-in-controls">
      <button
        className="btn primary"
        disabled={busy || !google}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const r = await authClient.signIn.social({
              provider: "google",
              callbackURL: "/budget",
              errorCallbackURL: "/?authError=1",
            });
            if (r.error) throw new Error();
          } catch {
            setError("Google sign-in could not start. Please try again.");
            setBusy(false);
          }
        }}
      >
        {busy ? (
          <LoaderCircle className="spin" size={18} />
        ) : (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M21.6 12.2c0-.7-.1-1.5-.2-2.2H12v4.2h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.8 3-4.3 3-7.5ZM12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 .9-3.4.9-2.6 0-4.8-1.8-5.6-4.2H3.1v2.6A10 10 0 0 0 12 22ZM6.4 13.8a6 6 0 0 1 0-3.6V7.6H3.1a10 10 0 0 0 0 8.8l3.3-2.6ZM12 6c1.5 0 2.8.5 3.9 1.5l2.9-2.9A9.9 9.9 0 0 0 12 2a10 10 0 0 0-8.9 5.6l3.3 2.6C7.2 7.8 9.4 6 12 6Z" />
          </svg>
        )}
        Continue with Google
        <ArrowRight size={16} />
      </button>
      {!google && (
        <p className="small muted">
          Google sign-in will be available once the app is configured.
        </p>
      )}
      {testMode && (
        <div className="local-login">
          <p className="eyebrow">Local development</p>
          <button
            className="btn"
            disabled={busy}
            onClick={() => local("owner")}
          >
            Sign in as local owner
          </button>
          <button
            className="text-btn"
            disabled={busy}
            onClick={() => local("guest")}
          >
            Try an account awaiting approval
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </div>
  );
}
