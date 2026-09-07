"use client";

import { KeyRound, Pencil, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { SignInModal, TopBar, refreshHasKeys, useUser } from "@/components/ui";
import { fmtTime } from "@/lib/clinical";

type Row = {
  id: number;
  name: string;
  role: string;
  unit: string;
  codeMask: string;
  createdAt: string;
  createdBy: string;
};

const ROLES = ["Consultant", "Senior Registrar", "Postgraduate", "Staff Nurse", "Pharmacist", "Other"];
const UNITS = ["NICU", "PICU", "STEPDOWN", "POSTNATAL", "PAEDS", ""];

export default function KeymastersPage() {
  const user = useUser();
  const [rows, setRows] = useState<Row[]>([]);
  const [hasKeys, setHasKeys] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [role, setRole] = useState(ROLES[0]);
  const [unit, setUnit] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editUnit, setEditUnit] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editCurrent, setEditCurrent] = useState("");
  const [signInOpen, setSignInOpen] = useState(false);

  const load = async () => {
    try {
      const r = await fetch("/api/keymasters", { cache: "no-store" });
      const j = await r.json();
      setRows(j.rows ?? []);
      setHasKeys(Boolean(j.hasKeys));
    } catch {
      /* offline */
    }
  };
  useEffect(() => {
    load();
    const sync = () => load();
    window.addEventListener("neo:session", sync);
    return () => window.removeEventListener("neo:session", sync);
  }, []);

  const bootstrap = hasKeys === false;
  const canManage = user.signedIn || bootstrap;

  const add = async () => {
    setBusy(true);
    setErr("");
    if (code !== confirmCode) {
      setErr("The two employee codes do not match.");
      setBusy(false);
      return;
    }
    const r = await fetch("/api/keymasters", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(user.signedIn ? { "x-editor": user.name, "x-code": user.code } : {}),
      },
      body: JSON.stringify({ name, code, role, unit }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) {
      setErr(j.error ?? "Could not add.");
      return;
    }
    setName("");
    setCode("");
    setConfirmCode("");
    await load();
    await refreshHasKeys();
  };

  const saveEdit = async () => {
    if (!editing) return;
    setBusy(true);
    setErr("");
    const r = await fetch("/api/keymasters", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-editor": user.name, "x-code": user.code },
      body: JSON.stringify({
        id: editing.id,
        name: editName || undefined,
        role: editRole || undefined,
        unit: editUnit,
        code: editCode || undefined,
        currentCode: editCurrent || undefined,
      }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) {
      setErr(j.error ?? "Could not update.");
      return;
    }
    setEditing(null);
    setEditCode("");
    setEditCurrent("");
    await load();
  };

  const remove = async (row: Row) => {
    if (!window.confirm(`Remove ${row.name} from the Keymaster List? They will lose edit access.`)) return;
    await fetch(`/api/keymasters?id=${row.id}`, {
      method: "DELETE",
      headers: { "x-editor": user.name, "x-code": user.code },
    });
    await load();
    await refreshHasKeys();
  };

  return (
    <main className="min-h-screen pb-20">
      <TopBar />
      <div className="mx-auto max-w-4xl px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-cyan-400/40 bg-cyan-400/10 text-cyan-300">
            <KeyRound size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-black tracking-tight text-white">Keymaster List</h1>
            <p className="text-[11px] text-slate-400">
              Everyone registered here can sign in with their <b>employee code</b> (the password). Anyone else is
              view-only.
            </p>
          </div>
          {!user.signedIn && hasKeys && (
            <button className="btn-primary" onClick={() => setSignInOpen(true)}>
              Sign in
            </button>
          )}
        </div>

        {bootstrap && (
          <div className="mb-4 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-[12px] text-amber-200">
            <b>Setup mode.</b> No keys exist yet, so the unit is open for editing. Register the first person below —
            from that moment on, editing requires signing in with an employee code.
          </div>
        )}
        {hasKeys && !user.signedIn && (
          <div className="mb-4 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-[12px] text-amber-200">
            You are viewing as a guest. Sign in with your employee code to manage this list or edit records.
          </div>
        )}

        {/* ---------- add form ---------- */}
        <section className="card mb-4 p-4">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-black text-white">
            <UserPlus size={14} className="text-cyan-300" /> Add to Keymaster List
          </h2>
          <fieldset disabled={!canManage} className="space-y-3 disabled:opacity-50">
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <span className="lbl mb-1 block">Full name</span>
                <input className="inp" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dr. Sujamariam" />
              </label>
              <label>
                <span className="lbl mb-1 block">Role</span>
                <select className="inp" value={role} onChange={(e) => setRole(e.target.value)}>
                  {ROLES.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="lbl mb-1 block">Employee code (password)</span>
                <input className="inp" type="password" value={code} onChange={(e) => setCode(e.target.value)} placeholder="min 3 characters" />
              </label>
              <label>
                <span className="lbl mb-1 block">Confirm code</span>
                <input className="inp" type="password" value={confirmCode} onChange={(e) => setConfirmCode(e.target.value)} placeholder="repeat code" />
              </label>
              <label className="sm:col-span-2">
                <span className="lbl mb-1 block">Home unit (optional)</span>
                <select className="inp" value={unit} onChange={(e) => setUnit(e.target.value)}>
                  {UNITS.map((u) => (
                    <option key={u || "any"} value={u}>
                      {u || "Any / floating"}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {err && <p className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-2 py-1 text-[11px] font-semibold text-rose-200">{err}</p>}
            <button className="btn-primary" onClick={add} disabled={busy || !name.trim() || code.length < 3}>
              {busy ? "Adding…" : "Add key"}
            </button>
          </fieldset>
        </section>

        {/* ---------- list ---------- */}
        <section className="card p-4">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-black text-white">
            <ShieldCheck size={14} className="text-emerald-300" /> Registered keys ({rows.length})
          </h2>
          {rows.length === 0 ? (
            <p className="text-[12px] text-slate-400">Nobody registered yet.</p>
          ) : (
            <ul className="space-y-2">
              {rows.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                  <span className="grid h-8 w-8 place-items-center rounded-lg border border-cyan-400/30 bg-cyan-400/10 text-[11px] font-black text-cyan-200">
                    {r.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-bold text-white">{r.name}</div>
                    <div className="text-[10px] text-slate-400">
                      {r.role}
                      {r.unit ? ` · ${r.unit}` : ""} · code {r.codeMask} · added {fmtTime(r.createdAt)} by {r.createdBy}
                    </div>
                  </div>
                  {user.signedIn && (
                    <>
                      <button
                        className="btn-ghost !px-2 !py-1 text-[11px]"
                        onClick={() => {
                          setEditing(r);
                          setEditName(r.name);
                          setEditRole(r.role);
                          setEditUnit(r.unit);
                          setEditCode("");
                          setEditCurrent("");
                        }}
                      >
                        <Pencil size={12} /> Edit
                      </button>
                      <button className="btn-ghost !px-2 !py-1 text-[11px] text-rose-300" onClick={() => remove(r)}>
                        <Trash2 size={12} /> Remove
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---------- edit modal ---------- */}
        {editing && (
          <div className="fixed inset-0 z-[90] grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="card w-full max-w-sm p-5">
              <h2 className="mb-3 text-sm font-black text-white">Edit {editing.name}</h2>
              <label className="lbl mb-1 block">Name</label>
              <input className="inp mb-2" value={editName} onChange={(e) => setEditName(e.target.value)} />
              <label className="lbl mb-1 block">Role</label>
              <select className="inp mb-2" value={editRole} onChange={(e) => setEditRole(e.target.value)}>
                {ROLES.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
              <label className="lbl mb-1 block">Home unit</label>
              <select className="inp mb-2" value={editUnit} onChange={(e) => setEditUnit(e.target.value)}>
                {UNITS.map((u) => (
                  <option key={u || "any"} value={u}>
                    {u || "Any / floating"}
                  </option>
                ))}
              </select>
              <label className="lbl mb-1 block">New employee code (optional)</label>
              <input className="inp mb-2" type="password" value={editCode} onChange={(e) => setEditCode(e.target.value)} placeholder="leave blank to keep" />
              {editCode && (
                <>
                  <label className="lbl mb-1 block">Current code (to authorise rotation)</label>
                  <input className="inp mb-2" type="password" value={editCurrent} onChange={(e) => setEditCurrent(e.target.value)} />
                </>
              )}
              {err && <p className="mb-2 rounded-lg border border-rose-400/40 bg-rose-500/10 px-2 py-1 text-[11px] font-semibold text-rose-200">{err}</p>}
              <div className="flex justify-end gap-2">
                <button className="btn-ghost" onClick={() => setEditing(null)}>
                  Cancel
                </button>
                <button className="btn-primary" onClick={saveEdit} disabled={busy}>
                  {busy ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}

        {signInOpen && <SignInModal onClose={() => setSignInOpen(false)} />}
      </div>
    </main>
  );
}
