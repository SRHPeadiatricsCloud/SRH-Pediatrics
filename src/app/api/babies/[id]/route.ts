import { NextResponse } from "next/server";
import { db } from "@/db";
import { babies, events, handovers, keymasters, problems, tasks, vitals } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { editorOfChecked, unsigned } from "@/lib/guard";

export const dynamic = "force-dynamic";

const intFields = new Set(["gestWeeks", "gestDays", "birthWeight", "currentWeight", "apgar1", "apgar5"]);
const int = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : v;
};

function validateFluidPayload(value: unknown): string[] {
  if (!value || typeof value !== "object") return ["Fluids must be an object."];
  const fluids = value as Record<string, unknown>;
  const errors: string[] = [];
  const numeric = (key: string) => {
    const candidate = fluids[key];
    return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : undefined;
  };
  const dosingWeight = numeric("dosingWeightKg");
  if (dosingWeight !== undefined && (dosingWeight < 0.3 || dosingWeight > 6)) errors.push("Dosing weight must be between 0.3 and 6 kg.");
  const dextrose = numeric("dextrosePct");
  if (dextrose !== undefined && (dextrose < 5 || dextrose > 30)) errors.push("Dextrose must be between 5% and 30%.");
  for (const key of ["totalMlKgDay", "enteralMlKgDay", "ivMlKgDay", "feedMl", "feedMlPerHour"] as const) {
    const candidate = numeric(key);
    if (candidate !== undefined && candidate < 0) errors.push(`${key} cannot be negative.`);
  }
  const total = numeric("totalMlKgDay");
  const enteral = numeric("enteralMlKgDay");
  const iv = numeric("ivMlKgDay");
  if (total !== undefined && enteral !== undefined && iv !== undefined && Math.abs(total - (enteral + iv)) > 0.0001) errors.push(`Fluid mismatch: total ${total} must equal enteral ${enteral} plus IV/TPN ${iv} ml/kg/day.`);
  const fortifiers = fluids.fortifiers;
  if (Array.isArray(fortifiers)) {
    fortifiers.forEach((fortifier, index) => {
      if (!fortifier || typeof fortifier !== "object") return errors.push(`Fortifier ${index + 1} is invalid.`);
      const item = fortifier as Record<string, unknown>;
      const phase = Number(item.phase);
      const reference = Number(item.referenceVolumeMl);
      const amount = item.amount == null ? 1 : Number(item.amount);
      if (!Number.isFinite(phase) || phase < 0 || phase > 1.5) errors.push(`Fortifier ${index + 1} phase must be between 0 and 1.5.`);
      if (!Number.isFinite(reference) || reference <= 0) errors.push(`Fortifier ${index + 1} needs a positive reference volume.`);
      if (!Number.isFinite(amount) || amount < 0) errors.push(`Fortifier ${index + 1} amount cannot be negative.`);
      if (item.minimumAmount != null && amount < Number(item.minimumAmount)) errors.push(`Fortifier ${index + 1} amount is below its minimum.`);
      if (item.maximumAmount != null && amount > Number(item.maximumAmount)) errors.push(`Fortifier ${index + 1} amount is above its maximum.`);
    });
  }
  const feedsGiven = fluids.feedsGiven;
  if (Array.isArray(feedsGiven)) feedsGiven.forEach((feed, index) => {
    if (!feed || typeof feed !== "object") return errors.push(`Feed ${index + 1} is invalid.`);
    const item = feed as Record<string, unknown>;
    for (const key of ["volumeMl", "plannedVolumeMl"] as const) if (item[key] != null && (!Number.isFinite(Number(item[key])) || Number(item[key]) < 0)) errors.push(`Feed ${index + 1} ${key} cannot be negative.`);
    if (item.status != null && !["given", "held", "refused", "emesis"].includes(String(item.status))) errors.push(`Feed ${index + 1} has an invalid outcome.`);
  });
  return errors;
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const id = Number((await ctx.params).id);
  const [baby] = await db.select().from(babies).where(eq(babies.id, id));
  if (!baby) return NextResponse.json({ error: "not found" }, { status: 404 });
  const [probs, vits, evts, tsks, hos] = await Promise.all([
    db.select().from(problems).where(eq(problems.babyId, id)).orderBy(desc(problems.createdAt)),
    db.select().from(vitals).where(eq(vitals.babyId, id)).orderBy(desc(vitals.recordedAt)).limit(40),
    db.select().from(events).where(eq(events.babyId, id)).orderBy(desc(events.at)).limit(60),
    db.select().from(tasks).where(eq(tasks.babyId, id)).orderBy(desc(tasks.createdAt)),
    db.select().from(handovers).where(eq(handovers.babyId, id)).orderBy(desc(handovers.createdAt)).limit(20),
  ]);
  return NextResponse.json({
    baby,
    problems: probs,
    vitals: vits,
    events: evts,
    tasks: tsks,
    handovers: hos,
    serverTime: new Date().toISOString(),
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const editor = await editorOfChecked(req);
  if (!editor) return unsigned();
  const id = Number((await ctx.params).id);
  const body = await req.json();
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body.clinical?.fluids) {
    const validationErrors = validateFluidPayload(body.clinical.fluids);
    if (validationErrors.length) return NextResponse.json({ error: validationErrors.join(" "), validationErrors }, { status: 422 });
    const keyRows = await db.select().from(keymasters);
    const actor = keyRows.find((row) => row.name.toLowerCase() === editor.toLowerCase());
    const role = actor?.role ?? req.headers.get("x-role") ?? "";
    const kind = String(body.logEvent?.kind ?? "fluid-edit");
    const canModifyFluids = /admin|consultant|registrar|postgraduate|resident/i.test(role);
    const canLogFeed = canModifyFluids || /nurse/i.test(role);
    if (!canModifyFluids && !(canLogFeed && kind === "feed-given")) {
      return NextResponse.json({ error: "Only a credentialed clinician may alter fluids/TPN; nurses may log feeds." }, { status: 403 });
    }
    if (!canModifyFluids) {
      const [currentBaby] = await db.select().from(babies).where(eq(babies.id, id));
      const existing = { ...(((currentBaby?.clinical as { fluids?: Record<string, unknown> } | null)?.fluids) ?? {}) };
      const incoming = { ...(body.clinical.fluids as Record<string, unknown>) };
      delete existing.feedsGiven;
      delete incoming.feedsGiven;
      if (JSON.stringify(existing) !== JSON.stringify(incoming)) {
        return NextResponse.json({ error: "Nurses may log feeds only; fluid targets and composition require a credentialed clinician." }, { status: 403 });
      }
    }
  }
  const scalar = [
    "uhid",
    "babyName",
    "motherName",
    "bed",
    "unit",
    "subspecialty",
    "insurance",
    "insuranceName",
    "sex",
    "gestWeeks",
    "gestDays",
    "birthWeight",
    "currentWeight",
    "birthLength",
    "birthHc",
    "deliveryMode",
    "apgar1",
    "apgar5",
    "bloodGroup",
    "motherBloodGroup",
    "inborn",
    "acuity",
    "status",
    "isolation",
    "consultant",
  ];
  for (const k of scalar) if (k in body) patch[k] = intFields.has(k) ? int(body[k]) : body[k];
  if (body.dob) patch.dob = new Date(body.dob);
  if (body.clinical) {
    const [cur] = await db.select().from(babies).where(eq(babies.id, id));
    if (body.expectedUpdatedAt && body.clinical.fluids && cur?.updatedAt && new Date(body.expectedUpdatedAt).getTime() !== new Date(cur.updatedAt).getTime()) {
      return NextResponse.json({ conflict: true, error: "This plan changed on the server. Reload before saving." }, { status: 409 });
    }
    patch.clinical = { ...((cur?.clinical as object) ?? {}), ...body.clinical };
  }
  const [row] = await db.update(babies).set(patch).where(eq(babies.id, id)).returning();
  if (body.logEvent) {
    const kind = String(body.logEvent.kind ?? "update");
    const text = String(body.logEvent.text ?? "").trim();
    if (text) {
      const [alreadyLogged] = await db
        .select({ id: events.id })
        .from(events)
        .where(and(eq(events.babyId, id), eq(events.kind, kind), eq(events.text, text)))
        .limit(1);
      if (!alreadyLogged) {
        await db.insert(events).values({
          babyId: id,
          kind,
          text,
          author: ["fluid-edit", "fluid-advance", "feed-given"].includes(kind) ? `${body.logEvent.author ?? editor} · employee code verified` : body.logEvent.author ?? "Team",
        });
      }
    }
  }
  return NextResponse.json({ baby: row });
}

export async function DELETE(req: Request, ctx: Ctx) {
  if (!(await editorOfChecked(req))) return unsigned();
  const id = Number((await ctx.params).id);
  const permanent = new URL(req.url).searchParams.get("permanent") === "1";
  if (!permanent) {
    const [row] = await db
      .update(babies)
      .set({ status: "deleted", updatedAt: new Date() })
      .where(eq(babies.id, id))
      .returning();
    if (row) {
      await db.insert(events).values({
        babyId: id,
        kind: "delete",
        text: "Baby card moved to Recently deleted — can be undone or restored from local backup",
        author: "Team",
      });
    }
    return NextResponse.json({ ok: true, soft: true, baby: row ?? null });
  }
  await db.delete(problems).where(eq(problems.babyId, id));
  await db.delete(vitals).where(eq(vitals.babyId, id));
  await db.delete(events).where(eq(events.babyId, id));
  await db.delete(tasks).where(eq(tasks.babyId, id));
  await db.delete(handovers).where(eq(handovers.babyId, id));
  await db.delete(babies).where(and(eq(babies.id, id)));
  return NextResponse.json({ ok: true, soft: false });
}
