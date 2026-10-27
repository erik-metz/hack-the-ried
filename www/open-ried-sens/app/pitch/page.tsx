import type { Metadata } from "next";
import PitchHubClient from "./PitchHubClient";

export const metadata: Metadata = {
  title: "Stakeholder Pitch Decks & Präsentationen · HackTheRied",
  description:
    "Interne Präsentations- und Pitch-Decks für Politik, Bildungseinrichtungen, VHS, Tech-Community und Wirtschaft zum Thema Ried-Hackathon und Sensorbau.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function PitchHubPage() {
  return <PitchHubClient />;
}
