import { redirect } from "next/navigation";

/** Analytics & QI merged into the single Statistics & QI tab (4.1.1). */
export default function AnalyticsPage() {
  redirect("/statistics");
}
