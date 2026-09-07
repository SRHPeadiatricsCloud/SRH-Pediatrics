import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sri Ramakrishna Hospital · Department of Pediatrics",
    short_name: "SRH Pediatrics",
    description:
      "Realtime Monitoring and Clinical Handover Suite for the Department of Pediatrics — NICU, PICU, Step-down, Postnatal and Paediatric wards. AAP / NNF India / IAP aligned. Works on iOS, Android and Windows.",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#070c16",
    theme_color: "#0891b2",
    categories: ["medical", "health", "productivity"],
    icons: [
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/images/hospital-logo.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
