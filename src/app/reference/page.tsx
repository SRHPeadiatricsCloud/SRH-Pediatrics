import { TopBar } from "@/components/ui";
import { NicuDrugDoses } from "@/components/nicu-drug-doses";

export default function ReferencePage() {
  return (
    <main className="drugs-page min-h-screen pb-20">
      <TopBar />
      <div className="mx-auto max-w-[1440px] px-4 py-5">
        <NicuDrugDoses />
      </div>
    </main>
  );
}
