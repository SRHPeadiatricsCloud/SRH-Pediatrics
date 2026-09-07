import { NextResponse } from "next/server";
import { db } from "@/db";
import { babies, events, handovers, problems, tasks, vitals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { editorOfChecked, unsigned } from "@/lib/guard";

export const dynamic = "force-dynamic";

type Snap = {
  baby?: Record<string, unknown>;
  problems?: Record<string, unknown>[];
  vitals?: Record<string, unknown>[];
  events?: Record<string, unknown>[];
  tasks?: Record<string, unknown>[];
  handovers?: Record<string, unknown>[];
};

function asDate(v: unknown): Date | undefined {
  if (!v) return undefined;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

async function insertSnapshot(snap: Snap, labelSuffix = "") {
  const b = snap.baby ?? {};
  const name = String(b.babyName ?? "Restored baby") + labelSuffix;
  const [row] = await db
    .insert(babies)
    .values({
      uhid: String(b.uhid ?? `NICU-${Date.now().toString().slice(-6)}`),
      babyName: name,
      motherName: String(b.motherName ?? ""),
      bed: String(b.bed ?? ""),
      unit: String(b.unit ?? "nicu"),
      subspecialty: String(b.subspecialty ?? ""),
      insurance: String(b.insurance ?? ""),
      insuranceName: String(b.insuranceName ?? ""),
      sex: String(b.sex ?? "Male"),
      dob: asDate(b.dob) ?? new Date(),
      gestWeeks: Number(b.gestWeeks ?? 37),
      gestDays: Number(b.gestDays ?? 0),
      birthWeight: Number(b.birthWeight ?? 2500),
      currentWeight: Number(b.currentWeight ?? b.birthWeight ?? 2500),
      birthLength: Number(b.birthLength ?? 0),
      birthHc: Number(b.birthHc ?? 0),
      deliveryMode: String(b.deliveryMode ?? "LSCS"),
      apgar1: Number(b.apgar1 ?? 8),
      apgar5: Number(b.apgar5 ?? 9),
      bloodGroup: String(b.bloodGroup ?? "Unknown"),
      motherBloodGroup: String(b.motherBloodGroup ?? "Unknown"),
      inborn: Boolean(b.inborn ?? true),
      acuity: String(b.acuity ?? "stable"),
      status: "active",
      isolation: String(b.isolation ?? "none"),
      consultant: String(b.consultant ?? ""),
      clinical: (b.clinical as object) ?? {},
    })
    .returning();

  const id = row.id;
  const probs = snap.problems ?? [];
  if (probs.length) {
    await db.insert(problems).values(
      probs.map((p) => ({
        babyId: id,
        system: String(p.system ?? "Other"),
        label: String(p.label ?? "Problem"),
        detail: String(p.detail ?? ""),
        status: String(p.status ?? "active"),
        onsetAt: asDate(p.onsetAt) ?? new Date(),
        resolvedAt: asDate(p.resolvedAt) ?? null,
      })),
    );
  }
  const vits = snap.vitals ?? [];
  if (vits.length) {
    await db.insert(vitals).values(
      vits.map((v) => ({
        babyId: id,
        recordedAt: asDate(v.recordedAt) ?? new Date(),
        recordedBy: String(v.recordedBy ?? "Restored"),
        hr: v.hr == null ? null : Number(v.hr),
        rr: v.rr == null ? null : Number(v.rr),
        spo2: v.spo2 == null ? null : Number(v.spo2),
        spo2Post: v.spo2Post == null ? null : Number(v.spo2Post),
        temp: v.temp == null ? null : Number(v.temp),
        sbp: v.sbp == null ? null : Number(v.sbp),
        dbp: v.dbp == null ? null : Number(v.dbp),
        map: v.map == null ? null : Number(v.map),
        crt: v.crt == null ? null : Number(v.crt),
        rbs: v.rbs == null ? null : Number(v.rbs),
        fio2: v.fio2 == null ? null : Number(v.fio2),
        painScore: v.painScore == null ? null : Number(v.painScore),
        painScale: String(v.painScale ?? "NIPS"),
        painRaw: v.painRaw == null ? (v.painScore == null ? null : Number(v.painScore)) : Number(v.painRaw),
        urineMlKgHr: v.urineMlKgHr == null ? null : Number(v.urineMlKgHr),
        notes: String(v.notes ?? ""),
      })),
    );
  }
  const evts = snap.events ?? [];
  if (evts.length) {
    await db.insert(events).values(
      evts.map((e) => ({
        babyId: id,
        kind: String(e.kind ?? "note"),
        text: String(e.text ?? ""),
        author: String(e.author ?? "Restored"),
        at: asDate(e.at) ?? new Date(),
      })),
    );
  } else {
    await db.insert(events).values({
      babyId: id,
      kind: "restore",
      text: "Record restored from local backup",
      author: "Backup engine",
    });
  }
  const tsks = snap.tasks ?? [];
  if (tsks.length) {
    await db.insert(tasks).values(
      tsks.map((t) => ({
        babyId: id,
        text: String(t.text ?? ""),
        priority: String(t.priority ?? "today"),
        done: Boolean(t.done),
        // backward-compatible: older backups may not carry completion metadata
        doneAt: t.done && t.doneAt ? new Date(String(t.doneAt)) : null,
        doneBy: String(t.doneBy ?? ""),
        owner: String(t.owner ?? "Team"),
      })),
    );
  }
  const hos = snap.handovers ?? [];
  if (hos.length) {
    await db.insert(handovers).values(
      hos.map((h) => ({
        babyId: id,
        shift: String(h.shift ?? "Morning"),
        fromStaff: String(h.fromStaff ?? ""),
        toStaff: String(h.toStaff ?? ""),
        illness: String(h.illness ?? "stable"),
        summary: String(h.summary ?? ""),
        actions: (h.actions as unknown[]) ?? [],
        contingency: (h.contingency as unknown[]) ?? [],
        synthesis: String(h.synthesis ?? ""),
        snapshot: (h.snapshot as object) ?? {},
        acknowledgedBy: String(h.acknowledgedBy ?? ""),
        acknowledgedAt: asDate(h.acknowledgedAt) ?? null,
      })),
    );
  }
  return row;
}

export async function POST(req: Request) {
  if (!(await editorOfChecked(req))) return unsigned();
  const body = await req.json();
  const mode = body.mode === "reactivate" ? "reactivate" : "new";
  const snap = (body.snapshot ?? body) as Snap;
  const baby = snap.baby ?? {};
  const originalId = Number(baby.id ?? 0);

  if (mode === "reactivate" && originalId) {
    const [existing] = await db.select().from(babies).where(eq(babies.id, originalId));
    if (existing) {
      const [row] = await db
        .update(babies)
        .set({
          status: "active",
          updatedAt: new Date(),
          babyName: String(baby.babyName ?? existing.babyName),
          motherName: String(baby.motherName ?? existing.motherName),
          bed: String(baby.bed ?? existing.bed),
          currentWeight: Number(baby.currentWeight ?? existing.currentWeight),
          acuity: String(baby.acuity ?? existing.acuity),
          consultant: String(baby.consultant ?? existing.consultant),
          isolation: String(baby.isolation ?? existing.isolation),
          clinical: (baby.clinical as object) ?? existing.clinical,
        })
        .where(eq(babies.id, originalId))
        .returning();
      await db.insert(events).values({
        babyId: originalId,
        kind: "restore",
        text: "Card restored (undo / local backup)",
        author: body.author ?? "Team",
      });
      return NextResponse.json({ baby: row, restored: "reactivated" });
    }
  }

  const row = await insertSnapshot(snap, body.asCopy ? " (restored)" : "");
  return NextResponse.json({ baby: row, restored: "inserted" });
}
