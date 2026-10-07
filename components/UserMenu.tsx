"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useId } from "react";
import { LogOut, ShieldCheck, ChevronDown } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import type { AppUser } from "@/lib/dal";
import ThemeSelector from "./ThemeSelector";
export default function UserMenu({
  user,
  confirmLeave,
}: {
  user: AppUser;
  confirmLeave?: () => boolean;
}) {
  const [open, setOpen] = useState(false),
    [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    id = useId(),
    router = useRouter();
  useEffect(() => {
    if (!open) return;
    const dismiss = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  return (
    <div
      className="user-menu"
      ref={root}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setOpen(false);
          trigger.current?.focus();
        }
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <button
        className="profile-trigger"
        aria-label="Your account"
        aria-expanded={open}
        aria-controls={id}
        ref={trigger}
        onClick={() => setOpen(!open)}
      >
        <span className="avatar">
          {user.name
            .split(" ")
            .map((n) => n[0])
            .slice(0, 2)
            .join("")}
        </span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="profile-panel" id={id}>
          <strong>{user.name}</strong>
          <p className="muted small">{user.email}</p>
          {user.admin && (
            <Link className="btn" href="/admin" onClick={() => setOpen(false)}>
              <ShieldCheck size={16} />
              Manage access
            </Link>
          )}
          <ThemeSelector />
          <button
            className="btn"
            onClick={async () => {
              if (confirmLeave && !confirmLeave()) return;
              const r = await authClient.signOut();
              if (r.error) {
                setError("Could not sign out. Try again.");
                return;
              }
              router.push("/");
              router.refresh();
            }}
          >
            <LogOut size={16} />
            Sign out
          </button>
          {error && (
            <p role="alert" className="error-text small">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
