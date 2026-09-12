"use client";

import { useState } from "react";
import { TopBar } from "@/components/ui";
import { NicuDrugDoses } from "@/components/nicu-drug-doses";
import { PediatricDrugDoses } from "@/components/pediatric-drug-doses";

export default function ReferencePage() {
  const [scope, setScope] = useState<"pediatrics" | "nicu">("pediatrics");
  return (
    <main className="drugs-page min-h-screen pb-20">
      <TopBar />
      <div className="mx-auto max-w-[1440px] px-4 py-5">
        <div className="dose-scope-switch" role="tablist" aria-label="Dose reference population">
          <button type="button" role="tab" aria-selected={scope === "pediatrics"} className={scope === "pediatrics" ? "active" : ""} onClick={() => setScope("pediatrics")}><b>Pediatrics</b><small>Children · age and weight</small></button>
          <button type="button" role="tab" aria-selected={scope === "nicu"} className={scope === "nicu" ? "active" : ""} onClick={() => setScope("nicu")}><b>Neonate</b><small>NICU · gestation and timing</small></button>
        </div>
        {scope === "pediatrics" ? <PediatricDrugDoses /> : <NicuDrugDoses />}
      </div>
    </main>
  );
}
