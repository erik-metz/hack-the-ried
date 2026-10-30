import PageContent from "./PageContent";

export const dynamic = "error";
export const metadata = {
  title: "Kommunalfinanzen & Haushalte | HackTheRied",
  description:
    "Transparente Gemeindehaushalte, Steuereinnahmen, Ausgaben für Schulen und Straßen sowie Wahlergebnisse für Bürstadt, Lampertheim, Biblis und Groß-Rohrheim.",
};
export default function Page() { return <PageContent />; }
