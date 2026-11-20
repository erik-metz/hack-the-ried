import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/siteOrigin";

const publicPaths = [
  "/",
  "/bauen-wohnen",
  "/branding",
  "/daten",
  "/datenschutz",
  "/demografie",
  "/energie/markt",
  "/g/1",
  "/haushalt",
  "/impressum",
  "/karte",
  "/quellen",
  "/regionalatlas",
  "/regionalatlas/bahn",
  "/sensor-bauen",
  "/statistik",
  "/termine",
  "/umwelt",
  "/umwelt/abfluss",
  "/umwelt/biodiversitaet",
  "/umwelt/boden",
  "/umwelt/pollen",
  "/umwelt/referenzdaten",
  "/wahlen",
  "/wirtschaft",
];

export default function sitemap(): MetadataRoute.Sitemap {
  return publicPaths.map((path) => ({ url: new URL(path, siteOrigin).href }));
}
