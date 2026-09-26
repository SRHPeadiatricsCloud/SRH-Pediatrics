import { redirect } from "next/navigation";

/** Analytics & QI merged into the single Statistics & QI tab (4.1.4). */
export default function AnalyticsPage() {
  redirect("/statistics");
}
