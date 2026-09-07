import { NextResponse } from "next/server";
import { db } from "@/db";
import { babies, events, problems } from "@/db/schema";
import { desc } from "drizzle-orm";
import { editorOfChecked, unsigned } from "@/lib/guard";

export const dynamic = "force-dynamic";

const int = (v: unknown, fallback: number) => {
  const n = Number(v ?? fallback);
  return Number.isFinite(n) ? Math.round(n) : fallback;
};

export async function GET() {
  const rows = await db.select().from(babies).orderBy(desc(babies.updatedAt));
  return NextResponse.json({ babies: rows });
}

export async function POST(req: Request) {
  if (!(await editorOfChecked(req))) return unsigned();
  const body = await req.json();
  const initialProblems: { system: string; label: string }[] = body.problems ?? [];
  const [row] = await db
    .insert(babies)
    .values({
      uhid: body.uhid || `NICU-${Date.now().toString().slice(-6)}`,
      babyName: body.babyName || "Baby of " + (body.motherName || "Unknown"),
      motherName: body.motherName ?? "",
      bed: body.bed ?? "",
      unit: body.unit ?? "nicu",
      subspecialty: body.subspecialty ?? "",
      insurance: body.insurance ?? "",
      insuranceName: body.insuranceName ?? "",
      sex: body.sex ?? "Male",
      dob: body.dob ? new Date(body.dob) : new Date(),
      gestWeeks: int(body.gestWeeks, 37),
      gestDays: int(body.gestDays, 0),
      birthWeight: int(body.birthWeight, 2500),
      currentWeight: int(body.currentWeight ?? body.birthWeight, 2500),
      birthLength: int(body.birthLength, 0),
      birthHc: int(body.birthHc, 0),
      deliveryMode: body.deliveryMode ?? "LSCS",
      apgar1: int(body.apgar1, 8),
      apgar5: int(body.apgar5, 9),
      bloodGroup: body.bloodGroup ?? "Unknown",
      motherBloodGroup: body.motherBloodGroup ?? "Unknown",
      inborn: body.inborn ?? true,
      acuity: body.acuity ?? "stable",
      isolation: body.isolation ?? "none",
      consultant: body.consultant ?? "",
      clinical: body.clinical ?? {},
    })
    .returning();

  if (initialProblems.length) {
    await db
      .insert(problems)
      .values(initialProblems.map((p) => ({ babyId: row.id, system: p.system, label: p.label })));
  }
  await db.insert(events).values({
    babyId: row.id,
    kind: "admission",
    text: `Admitted to NICU · ${row.gestWeeks}+${row.gestDays} wk · ${row.birthWeight} g`,
    author: body.author ?? "Admitting team",
  });

  return NextResponse.json({ baby: row });
}
