"use client";
import { useState } from "react";
import { ShieldCheck, UserCheck, UserX, LoaderCircle } from "lucide-react";
import { request } from "@/lib/client";
type ManagedUser = {
  id: string;
  name: string;
  email: string;
  disabled: boolean;
  admin: boolean;
};
export default function AdminUsers({
  initialUsers,
}: {
  initialUsers: ManagedUser[];
}) {
  const [users, setUsers] = useState(initialUsers),
    [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  return (
    <section className="panel">
      <div className="section-title">
        <div>
          <h2>Accounts</h2>
          <p className="small muted">
            {users.filter((u) => u.disabled).length} awaiting access ·{" "}
            {users.length} total
          </p>
        </div>
        <ShieldCheck size={19} className="accent" />
      </div>
      <p className="small muted">
        Approval gives each person a separate private budget. Admins can manage
        access; financial data stays with its owner.
      </p>
      {users.map((u) => (
        <div className="admin-row" key={u.id}>
          <div className="avatar">{u.name.slice(0, 1)}</div>
          <div className="admin-identity">
            <strong>{u.name}</strong>
            <span className="small muted">{u.email}</span>
          </div>
          <span className={`status-pill ${u.disabled ? "waiting" : ""}`}>
            {u.admin ? "Admin" : u.disabled ? "Pending / disabled" : "Active"}
          </span>
          {!u.admin && (
            <button
              className="btn"
              disabled={busy !== null}
              onClick={async () => {
                setBusy(u.id);
                setError("");
                setMessage("");
                try {
                  await request(`/api/admin/users/${u.id}`, "PATCH", {
                    disabled: !u.disabled,
                  });
                  setUsers(
                    users.map((x) =>
                      x.id === u.id ? { ...x, disabled: !u.disabled } : x,
                    ),
                  );
                  setMessage(
                    `${u.name} ${u.disabled ? "activated" : "disabled"}.`,
                  );
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Could not update access.",
                  );
                } finally {
                  setBusy(null);
                }
              }}
            >
              {busy === u.id ? (
                <LoaderCircle className="spin" size={15} />
              ) : u.disabled ? (
                <UserCheck size={15} />
              ) : (
                <UserX size={15} />
              )}
              {u.disabled ? "Activate" : "Disable"}
            </button>
          )}
        </div>
      ))}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <p role="status" className="small accent">
        {message}
      </p>
    </section>
  );
}
