import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PITCH_DECKS, getPitchDeckBySlug } from "@/lib/pitchData";
import PitchDeckClient from "./PitchDeckClient";

interface PitchDeckPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateStaticParams() {
  return PITCH_DECKS.map((deck) => ({
    slug: deck.slug,
  }));
}

export async function generateMetadata({
  params,
}: PitchDeckPageProps): Promise<Metadata> {
  const { slug } = await params;
  const deck = getPitchDeckBySlug(slug);

  if (!deck) {
    return {
      title: "Präsentation nicht gefunden · HackTheRied",
      robots: { index: false, follow: false },
    };
  }

  return {
    title: `${deck.title} · Pitch-Präsentation | HackTheRied`,
    description: deck.summary,
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function PitchDeckPage({ params }: PitchDeckPageProps) {
  const { slug } = await params;
  const deck = getPitchDeckBySlug(slug);

  if (!deck) {
    notFound();
  }

  return <PitchDeckClient deck={deck} />;
}
