export interface SlideBullet {
  title: string;
  description: string;
  iconName?: string;
  tag?: string;
}

export interface SlideStat {
  value: string;
  label: string;
  subtext?: string;
  color?: string;
}

export interface MapEvidence {
  serviceName: string;
  serviceUrl: string;
  imagePath: string;
  headline: string;
  description: string;
  riedStatus: string;
  impactBadge: string;
}

export interface CostComparisonItem {
  feature: string;
  openRiedSens: string;
  commercialSolution: string;
  advantage: string;
}

export interface CompetitiveMatrixPoint {
  name: string;
  x: number; // 0-100 (Datenoffenheit & Souveränität)
  y: number; // 0-100 (Bürgernähe & MINT-Bildung)
  description: string;
  isSelf?: boolean;
}

export interface MarketFunnelData {
  tam: { number: string; title: string; desc: string };
  sam: { number: string; title: string; desc: string };
  som: { number: string; title: string; desc: string };
}

export interface CoveragePlanItem {
  number: string;
  title: string;
  description: string;
  tag: string;
}

export interface DualPillarItem {
  tag: string;
  headline: string;
  description: string;
  imageSrc: string;
  badges: string[];
}

export interface CuriousHackathonExample {
  title: string;
  description: string;
  url: string;
  tag: string;
}

export interface TeamMember {
  name: string;
  location: string;
  role: string;
  imageSrc: string;
  bio: string;
  highlights: string[];
}

export interface StemSkillItem {
  category: "handwerk" | "sensorik" | "informatik" | "multiplikator";
  title: string;
  skills: string[];
  targetKids: string;
  targetAdults: string;
}

export interface SpecificAskItem {
  id: string;
  title: string;
  description: string;
  commitmentType:
    | "daten"
    | "infrastruktur"
    | "finanzen"
    | "praesenz"
    | "schulen";
  tag: string;
  actionText: string;
}

export type SlideLayout =
  | "data-connections"
  | "story"
  | "website"
  | "one-pager-hero"
  | "blindspot-evidence"
  | "value-prop-split"
  | "dual-pillars"
  | "open-innovation"
  | "product-architecture"
  | "tam-sam-som"
  | "coverage-plan"
  | "unit-economics"
  | "competitive-matrix"
  | "civic-alliance"
  | "traction-timeline"
  | "stem-learning-matrix"
  | "team-showcase"
  | "the-ask-commitment"
  | "collected-evidence";

export interface PitchSlide {
  id: string;
  stepNumber: number; // 1 to 9 / 10
  stepLabel: string; // e.g. "01 / Hook & One-Pager"
  eyebrow: string;
  title: string;
  lead: string;
  layout: SlideLayout;
  website?: { src: string; title: string };
  imageVisual?: {
    src: string;
    alt: string;
    caption?: string;
  };
  bullets?: SlideBullet[];
  stats?: SlideStat[];
  mapEvidence?: MapEvidence[];
  marketFunnel?: MarketFunnelData;
  coveragePlan?: CoveragePlanItem[];
  dualPillars?: DualPillarItem[];
  curiousHackathonExamples?: CuriousHackathonExample[];
  teamMembers?: TeamMember[];
  costComparison?: CostComparisonItem[];
  competitivePoints?: CompetitiveMatrixPoint[];
  stemSkills?: StemSkillItem[];
  specificAsks?: SpecificAskItem[];
  callToAction?: {
    primaryText: string;
    primaryHref: string;
    secondaryText?: string;
    secondaryHref?: string;
  };
}

export interface PitchDeck {
  slug: string;
  title: string;
  subtitle: string;
  targetAudience: string;
  category: "politik" | "bildung" | "wirtschaft";
  badge: string;
  accentColor: "emerald" | "sky" | "violet" | "amber";
  estimatedMinutes: number;
  summary: string;
  slides: PitchSlide[];
}

export const MAP_EVIDENCE_ITEMS: MapEvidence[] = [
  {
    serviceName: "Sensor.Community (Luftdaten.info)",
    serviceUrl: "https://sensor.community/de/",
    imagePath: "/pitch/sensor-community-ried-map.png",
    headline: "Bürger messen Luftqualität",
    description:
      "Externe Plattform als Hintergrund für Rückfragen. Die Karte bildet nur das jeweilige Netzwerk ab.",
    riedStatus: "Aktuellen Stand bei der Quelle prüfen.",
    impactBadge: "Hintergrundkarte",
  },
  {
    serviceName: "TTN Mapper (The Things Network)",
    serviceUrl: "https://ttnmapper.org/heatmap/",
    imagePath: "/pitch/ttn-mapper-ried-map.png",
    headline: "Kartierte LoRaWAN-Messfahrten",
    description:
      "Externe Plattform als Hintergrund für Rückfragen. Die Karte bildet nur das jeweilige Netzwerk ab.",
    riedStatus: "Aktuellen Stand bei der Quelle prüfen.",
    impactBadge: "Hintergrundkarte",
  },
  {
    serviceName:
      "Raspberryshaker (Seismograph für Erschütterungen & Geothermie)",
    serviceUrl: "https://raspberryshake.org/",
    imagePath: "/pitch/raspberry-shake-ried-map.png",
    headline: "Bürger messen Erschütterungen",
    description:
      "Externe Plattform als Hintergrund für Rückfragen. Die Karte bildet nur das jeweilige Netzwerk ab.",
    riedStatus: "Aktuellen Stand bei der Quelle prüfen.",
    impactBadge: "Hintergrundkarte",
  },
];

export const CORE_TEAM_MEMBERS: TeamMember[] = [
  {
    name: "Rüdiger Engert",
    location: "Bürstadt",
    role: "KAMÜ, Kultur und Bürgerinitiative",
    imageSrc: "/pitch/ruediger-engert.jpg",
    bio: "Gründer des KAMÜ im ehemaligen Engert Agrarmarkt. Bringt den Begegnungsort und die Verbindung zur Bürgerschaft ein.",
    highlights: [],
  },
  {
    name: "Michael Binzen",
    location: "Bürstadt",
    role: "Software, offene Daten und Jugendförderung",
    imageSrc: "/pitch/michael-binzen.jpg",
    bio: "Bringt Erfahrung aus der Bahn-IT und als Mentor bei Jugend hackt ein. Verbindet Datenideen mit gemeinsamer Projektarbeit.",
    highlights: [],
  },
  {
    name: "Erik Metz",
    location: "Nordheim / Ried",
    role: "Sensorbau und Open-Ried-Sens-Website",
    imageSrc: "/pitch/erik-metz.jpg",
    bio: "Bringt Erfahrung aus Automatisierung und IoT ein. Digital Fellow am MIT und Entwickler der Plattform.",
    highlights: [],
  },
];

export const POLITIK_DECK: PitchDeck = {
  slug: "politik",
  title: "Daten öffnen und Bürgerinitiative ermöglichen",
  subtitle:
    "Eine Bürgerinitiative für das Ried: vorhandene Daten nutzen, eigene Sensoren bauen und beim Hackathon gemeinsam Ideen entwickeln.",
  targetAudience: "Politik und kommunale Verwaltung",
  category: "politik",
  badge: "Politik",
  accentColor: "emerald",
  estimatedMinutes: 10,
  summary:
    "Rohdatenzugang zuerst, geeignete Funkinfrastruktur als zweiter Schritt. Alle Bitten auf einen Blick und echte Rohmesswerte zum Abschluss. Weitere Kontakte und Hackathon-Unterstützung ergänzen die Kooperation.",
  slides: [
    {
      id: "politik-team",
      stepNumber: 1,
      stepLabel: "01",
      eyebrow: "Open Ried Sens",
      title: "Unser Team im Ried",
      lead: "Wir sind drei Menschen aus der Region und möchten gemeinsam einen Hackathon für das Ried organisieren.",
      layout: "team-showcase",
      teamMembers: CORE_TEAM_MEMBERS,
      bullets: [],
    },
    {
      id: "politik-hackathon",
      stepNumber: 2,
      stepLabel: "02",
      eyebrow: "Open Ried Sens",
      title: "Was ist ein Hackathon?",
      lead: "Ein Hackathon bringt Menschen zusammen, um gemeinsam an Ideen für unsere Region zu arbeiten.",
      layout: "story",
      bullets: [
        {
          title: "Gemeinsam an regionalen Fragen arbeiten",
          description:
            "Bürger, Jugendliche, Entwickler und Fachleute lernen voneinander und entwickeln erste Prototypen.",
        },
        {
          title: "Kostenlos für die Politik",
          description:
            "Wir organisieren den Hackathon als Bürgerinitiative. Die Politik kann ihn ohne verpflichtenden finanziellen Beitrag unterstützen.",
        },
      ],
      imageVisual: {
        src: "/pitch/hackathon-kamue-community.jpg",
        alt: "Illustration gemeinsamer Projektarbeit beim Hackathon",
        caption: "Idee für das gemeinsame Arbeiten im KAMÜ",
      },
    },
    {
      id: "politik-origin",
      stepNumber: 3,
      stepLabel: "03",
      eyebrow: "Open Ried Sens",
      title: "Die Daten aus dem Smart-City-Projekt",
      lead: "Bürstadt und Lampertheim haben Messdaten geschaffen. Wir möchten die dahinterliegenden Rohdaten für eigene Auswertungen nutzen.",
      layout: "website",
      website: {
        src: "https://smartcity-system.de/buerstadt/dashboard_uebersicht",
        title: "Smart-City-Dashboard Bürstadt und Lampertheim",
      },
    },
    {
      id: "politik-collected",
      stepNumber: 4,
      stepLabel: "04",
      eyebrow: "Open Ried Sens",
      title: "Unsere Datenbasis für den Hackathon",
      lead: "Wir haben uns zum Ziel gemacht, weitere Open-Data-Daten für das Ried zu sammeln. Daraus ist die Open-Ried-Sens-Website als Datenbasis für den Hackathon entstanden.",
      layout: "website",
      website: {
        src: "/?cats=all#ried-map",
        title: "Open Ried Sens: Karte der gesammelten Regionaldaten",
      },
    },
    {
      id: "politik-sensors",
      title: "Sensorbau als gemeinsames Schülerprojekt",
      lead: "Für das ganze Ried fehlen uns noch ausreichend zugängliche Rohdaten. Deshalb möchten wir als Bürgerinitiative eigene smarte Sensoren bauen.",
      layout: "story",
      eyebrow: "Open Ried Sens",
      bullets: [
        {
          title: "Mit Schulen und Interessierten",
          description:
            "Jugendliche bauen Sensoren gemeinsam mit uns. VHS und weitere Interessierte können ebenfalls mitmachen.",
        },
        {
          title: "Weitere Umweltdaten sammeln",
          description:
            "Zum Beispiel Feinstaub und Luftqualität in Bürstadt und im Ried messen. Die Daten können Teams beim Hackathon untersuchen.",
        },
      ],
      imageVisual: {
        src: "/pitch/sensor-hardware-kit.jpg",
        alt: "Sensorbausatz für das gemeinsame Bildungsprojekt",
        caption: "Eigene Messstationen ergänzen vorhandene Daten.",
      },
      stepNumber: 5,
      stepLabel: "05",
    },
    {
      id: "politik-data-connections",
      title: "Daten verbinden, Zusammenhänge erkennen",
      lead: "Bisher getrennte Datenquellen ergeben gemeinsam ein genaueres Bild des Rieds.",
      layout: "data-connections",
      eyebrow: "Open Ried Sens",
      stepNumber: 6,
      stepLabel: "06",
    },
    {
      id: "politik-ask",
      title: "Unsere vier Bitten an die Politik",
      lead: "Am wichtigsten sind Rohdaten aus dem Smart-City-Projekt und der Zugang zur geeigneten Funkinfrastruktur.",
      layout: "the-ask-commitment",
      eyebrow: "Open Ried Sens",
      bullets: [],
      specificAsks: [
        {
          id: "ask-rohdaten",
          title: "1. Rohdaten des Smart-City-Projekts",
          description:
            "Rohdaten aus dem zuvor gezeigten Smart-City-Dashboard Bürstadt/Lampertheim: Einzelmessungen mit Zeitstempeln und geklärten Nutzungsbedingungen.",
          commitmentType: "daten",
          tag: "Höchste Priorität",
          actionText: "Datenansprechpartner benennen",
        },
        {
          id: "ask-infrastruktur",
          title: "2. Vorhandene Funkinfrastruktur nutzen",
          description:
            "Funktechnik und Betreiber klären. Falls ein geeignetes LoRaWAN-Netz vorhanden ist, unsere Sensoren testweise anbinden.",
          commitmentType: "infrastruktur",
          tag: "Zweite Priorität",
          actionText: "Netzprüfung vereinbaren",
        },
        {
          id: "ask-live-daten",
          title: "3. Kontakte zu weiteren Datenanbietern",
          description:
            "Kontakte zu Bahn, VRN und ZAKB vermitteln, um weitere Daten zu Verkehr und Müllfahrzeugen zu erschließen.",
          commitmentType: "daten",
          tag: "Ergänzende Unterstützung",
          actionText: "Termin vereinbaren",
        },
        {
          id: "ask-praesenz",
          title: "4. Bürgermeister beim Hackathon",
          description:
            "Ein oder beide Bürgermeister zur Eröffnung einladen. Keynote oder Unterstützung des Hauptpreises sind willkommen.",
          commitmentType: "praesenz",
          tag: "Optional",
          actionText: "Beteiligung besprechen",
        },
      ],
      stepNumber: 7,
      stepLabel: "07",
    },
    {
      id: "politik-bonus",
      title: "Bewegung im Ried",
      lead: "",
      layout: "collected-evidence",
      eyebrow: "Open Ried Sens",
      bullets: [],
      stepNumber: 8,
      stepLabel: "08",
    },
    {
      id: "politik-school-bridge",
      title: "So könnte ein erster Projekttag aussehen",
      lead: "Mit einer Partnerschule beginnen und später weitere Schulen im Ried einbeziehen.",
      layout: "story",
      eyebrow: "Open Ried Sens",
      bullets: [
        {
          title: "Gemeinsam bauen und verstehen",
          description:
            "Interessierte Jugendliche über Lehrkräfte, MINT-AGs oder Jugend forscht ansprechen. Betreuung, Material und Finanzierung vorab gemeinsam planen.",
        },
        {
          title: "Zu Hause weiterforschen",
          description:
            "Bei geeignetem Standort und mit Zustimmung der Familie kann der Sensor zu Hause stehen. Jugendliche zeigen ihre Ergebnisse und laden Familie und Nachbarn zum Hackathon ein.",
        },
      ],
      imageVisual: {
        src: "/pitch/schul-stem-workshop.jpg",
        alt: "Illustration eines möglichen Schulprojekttags",
        caption: "Interesse genügt. Vorkenntnisse sind keine Voraussetzung.",
      },
      stepNumber: 9,
      stepLabel: "09 / Backup",
    },
  ],
};

export const SCHULEN_DECK: PitchDeck = {
  slug: "schulen",
  title: "Sensorbau als gemeinsames Schulprojekt",
  subtitle:
    "Eine Bürgerinitiative für das Ried: vorhandene Daten nutzen, eigene Sensoren bauen und beim Hackathon gemeinsam Ideen entwickeln.",
  targetAudience: "Schulleitungen, MINT-Lehrkräfte und Jugend forscht",
  category: "bildung",
  badge: "Schulen",
  accentColor: "sky",
  estimatedMinutes: 10,
  summary:
    "Ein erster Projekttag mit interessierten Jugendlichen. Sensorbau, Messverständnis und freiwillige Teilnahme am Hackathon.",
  slides: [
    {
      id: "schulen-team",
      stepNumber: 1,
      stepLabel: "01",
      eyebrow: "Open Ried Sens",
      title: "Unser Team im Ried",
      lead: "Wir sind drei Menschen aus der Region und möchten gemeinsam einen Hackathon für das Ried organisieren.",
      layout: "team-showcase",
      teamMembers: CORE_TEAM_MEMBERS,
      bullets: [],
    },
    {
      id: "schulen-hackathon",
      stepNumber: 2,
      stepLabel: "02",
      eyebrow: "Open Ried Sens",
      title: "Was ist ein Hackathon?",
      lead: "Ein Hackathon bringt Menschen zusammen, um gemeinsam an Ideen für unsere Region zu arbeiten.",
      layout: "story",
      bullets: [
        {
          title: "Gemeinsam an regionalen Fragen arbeiten",
          description:
            "Bürger, Jugendliche, Entwickler und Fachleute lernen voneinander und entwickeln erste Prototypen.",
        },
        {
          title: "Kostenlos für die Politik",
          description:
            "Wir organisieren den Hackathon als Bürgerinitiative. Die Politik kann ihn ohne verpflichtenden finanziellen Beitrag unterstützen.",
        },
      ],
      imageVisual: {
        src: "/pitch/hackathon-kamue-community.jpg",
        alt: "Illustration gemeinsamer Projektarbeit beim Hackathon",
        caption: "Idee für das gemeinsame Arbeiten im KAMÜ",
      },
    },
    {
      id: "schulen-origin",
      stepNumber: 3,
      stepLabel: "03",
      eyebrow: "Open Ried Sens",
      title: "Die Daten aus dem Smart-City-Projekt",
      lead: "Bürstadt und Lampertheim haben Messdaten geschaffen. Wir möchten die dahinterliegenden Rohdaten für eigene Auswertungen nutzen.",
      layout: "website",
      website: {
        src: "https://smartcity-system.de/buerstadt/dashboard_uebersicht",
        title: "Smart-City-Dashboard Bürstadt und Lampertheim",
      },
    },
    {
      id: "schulen-collected",
      stepNumber: 4,
      stepLabel: "04",
      eyebrow: "Open Ried Sens",
      title: "Unsere Datenbasis für den Hackathon",
      lead: "Wir haben uns zum Ziel gemacht, weitere Open-Data-Daten für das Ried zu sammeln. Daraus ist die Open-Ried-Sens-Website als Datenbasis für den Hackathon entstanden.",
      layout: "website",
      website: {
        src: "/?cats=all#ried-map",
        title: "Open Ried Sens: Karte der gesammelten Regionaldaten",
      },
    },
    {
      id: "schulen-sensors",
      title: "Sensorbau als gemeinsames Schülerprojekt",
      lead: "Für das ganze Ried fehlen uns noch ausreichend zugängliche Rohdaten. Deshalb möchten wir als Bürgerinitiative eigene smarte Sensoren bauen.",
      layout: "story",
      eyebrow: "Open Ried Sens",
      bullets: [
        {
          title: "Mit Schulen und Interessierten",
          description:
            "Jugendliche bauen Sensoren gemeinsam mit uns. VHS und weitere Interessierte können ebenfalls mitmachen.",
        },
        {
          title: "Weitere Umweltdaten sammeln",
          description:
            "Zum Beispiel Feinstaub und Luftqualität in Bürstadt und im Ried messen. Die Daten können Teams beim Hackathon untersuchen.",
        },
      ],
      imageVisual: {
        src: "/pitch/sensor-hardware-kit.jpg",
        alt: "Sensorbausatz für das gemeinsame Bildungsprojekt",
        caption: "Eigene Messstationen ergänzen vorhandene Daten.",
      },
      stepNumber: 5,
      stepLabel: "05",
    },
    {
      id: "schulen-school-bridge",
      title: "So könnte ein erster Projekttag aussehen",
      lead: "Mit einer Partnerschule beginnen und später weitere Schulen im Ried einbeziehen.",
      layout: "story",
      eyebrow: "Open Ried Sens",
      bullets: [
        {
          title: "Gemeinsam bauen und verstehen",
          description:
            "Interessierte Jugendliche über Lehrkräfte, MINT-AGs oder Jugend forscht ansprechen. Betreuung, Material und Finanzierung vorab gemeinsam planen.",
        },
        {
          title: "Zu Hause weiterforschen",
          description:
            "Bei geeignetem Standort und mit Zustimmung der Familie kann der Sensor zu Hause stehen. Jugendliche zeigen ihre Ergebnisse und laden Familie und Nachbarn zum Hackathon ein.",
        },
      ],
      imageVisual: {
        src: "/pitch/schul-stem-workshop.jpg",
        alt: "Illustration eines möglichen Schulprojekttags",
        caption: "Interesse genügt. Vorkenntnisse sind keine Voraussetzung.",
      },
      stepNumber: 6,
      stepLabel: "06",
    },
    {
      id: "schulen-learning",
      stepNumber: 7,
      stepLabel: "07",
      eyebrow: "Open Ried Sens",
      title: "Was Jugendliche dabei lernen",
      lead: "Ein überschaubarer Einstieg, mit Raum für Vertiefung.",
      layout: "story",
      bullets: [
        {
          title: "Praktisches Handwerk",
          description:
            "Sensor und Gehäuse zusammenbauen, Werkzeuge unter Anleitung verwenden.",
        },
        {
          title: "Messwerte verstehen",
          description:
            "Messprinzip und Grenzen kennenlernen, Werte vergleichen und eigene Fragen untersuchen.",
        },
      ],
    },
    {
      id: "schulen-pilot",
      stepNumber: 8,
      stepLabel: "08",
      eyebrow: "Open Ried Sens",
      title: "Ein erster Projekttag",
      lead: "Mit einer Partnerschule starten und den Umfang gemeinsam festlegen.",
      layout: "story",
      bullets: [
        {
          title: "Gemeinsame Vorbereitung",
          description:
            "Altersgruppe, Betreuung, Räume, Werkzeuge und Material abstimmen.",
        },
        {
          title: "Finanzierung klären",
          description:
            "Wir fordern kein Schulbudget. Firmenpaten, Fördervereine oder andere Beiträge sollen die Bausätze ermöglichen. Zusagen vor der Ausschreibung klären.",
        },
      ],
    },
    {
      id: "schulen-next-step",
      stepNumber: 9,
      stepLabel: "09",
      eyebrow: "Open Ried Sens",
      title: "Unsere Bitte an die Schule",
      lead: "Eine Kontaktlehrkraft benennen und einen ersten Planungstermin vereinbaren.",
      layout: "the-ask-commitment",
      bullets: [],
      specificAsks: [
        {
          id: "school-day",
          title: "Projekttag und Ausschreibung",
          description:
            "Ein geeignetes Format abstimmen und interessierte Jugendliche ansprechen.",
          commitmentType: "schulen",
          tag: "Nächster Schritt",
          actionText: "Termin vereinbaren",
        },
        {
          id: "school-hackathon",
          title: "Freiwillig beim Hackathon mitmachen",
          description:
            "Jugendliche können ihre Messfragen und Ergebnisse einbringen. Standort und Teilnahme gemeinsam begleiten.",
          commitmentType: "praesenz",
          tag: "Nächster Schritt",
          actionText: "Termin vereinbaren",
        },
      ],
    },
    {
      id: "schulen-bonus",
      title: "Bewegung im Ried",
      lead: "",
      layout: "collected-evidence",
      eyebrow: "Open Ried Sens",
      bullets: [],
      stepNumber: 10,
      stepLabel: "10",
    },
  ],
};

export const VHS_DECK: PitchDeck = {
  slug: "vhs",
  title: "Sensorbau und Bürgerwissenschaft an der VHS",
  subtitle:
    "Eine Bürgerinitiative für das Ried: vorhandene Daten nutzen, eigene Sensoren bauen und beim Hackathon gemeinsam Ideen entwickeln.",
  targetAudience: "VHS-Leitungen und Erwachsenenbildung",
  category: "bildung",
  badge: "VHS",
  accentColor: "violet",
  estimatedMinutes: 10,
  summary:
    "Gemeinsam einen Pilotkurs planen: Sensoren bauen, Messwerte verstehen und im Ried mitforschen.",
  slides: [
    {
      id: "vhs-team",
      stepNumber: 1,
      stepLabel: "01",
      eyebrow: "Open Ried Sens",
      title: "Unser Team im Ried",
      lead: "Wir sind drei Menschen aus der Region und möchten gemeinsam einen Hackathon für das Ried organisieren.",
      layout: "team-showcase",
      teamMembers: CORE_TEAM_MEMBERS,
      bullets: [],
    },
    {
      id: "vhs-hackathon",
      stepNumber: 2,
      stepLabel: "02",
      eyebrow: "Open Ried Sens",
      title: "Was ist ein Hackathon?",
      lead: "Ein Hackathon bringt Menschen zusammen, um gemeinsam an Ideen für unsere Region zu arbeiten.",
      layout: "story",
      bullets: [
        {
          title: "Gemeinsam an regionalen Fragen arbeiten",
          description:
            "Bürger, Jugendliche, Entwickler und Fachleute lernen voneinander und entwickeln erste Prototypen.",
        },
        {
          title: "Kostenlos für die Politik",
          description:
            "Wir organisieren den Hackathon als Bürgerinitiative. Die Politik kann ihn ohne verpflichtenden finanziellen Beitrag unterstützen.",
        },
      ],
      imageVisual: {
        src: "/pitch/hackathon-kamue-community.jpg",
        alt: "Illustration gemeinsamer Projektarbeit beim Hackathon",
        caption: "Idee für das gemeinsame Arbeiten im KAMÜ",
      },
    },
    {
      id: "vhs-origin",
      stepNumber: 3,
      stepLabel: "03",
      eyebrow: "Open Ried Sens",
      title: "Die Daten aus dem Smart-City-Projekt",
      lead: "Bürstadt und Lampertheim haben Messdaten geschaffen. Wir möchten die dahinterliegenden Rohdaten für eigene Auswertungen nutzen.",
      layout: "website",
      website: {
        src: "https://smartcity-system.de/buerstadt/dashboard_uebersicht",
        title: "Smart-City-Dashboard Bürstadt und Lampertheim",
      },
    },
    {
      id: "vhs-collected",
      stepNumber: 4,
      stepLabel: "04",
      eyebrow: "Open Ried Sens",
      title: "Unsere Datenbasis für den Hackathon",
      lead: "Wir haben uns zum Ziel gemacht, weitere Open-Data-Daten für das Ried zu sammeln. Daraus ist die Open-Ried-Sens-Website als Datenbasis für den Hackathon entstanden.",
      layout: "website",
      website: {
        src: "/?cats=all#ried-map",
        title: "Open Ried Sens: Karte der gesammelten Regionaldaten",
      },
    },
    {
      id: "vhs-sensors",
      title: "Sensorbau als gemeinsames Schülerprojekt",
      lead: "Für das ganze Ried fehlen uns noch ausreichend zugängliche Rohdaten. Deshalb möchten wir als Bürgerinitiative eigene smarte Sensoren bauen.",
      layout: "story",
      eyebrow: "Open Ried Sens",
      bullets: [
        {
          title: "Mit Schulen und Interessierten",
          description:
            "Jugendliche bauen Sensoren gemeinsam mit uns. VHS und weitere Interessierte können ebenfalls mitmachen.",
        },
        {
          title: "Weitere Umweltdaten sammeln",
          description:
            "Zum Beispiel Feinstaub und Luftqualität in Bürstadt und im Ried messen. Die Daten können Teams beim Hackathon untersuchen.",
        },
      ],
      imageVisual: {
        src: "/pitch/sensor-hardware-kit.jpg",
        alt: "Sensorbausatz für das gemeinsame Bildungsprojekt",
        caption: "Eigene Messstationen ergänzen vorhandene Daten.",
      },
      stepNumber: 5,
      stepLabel: "05",
    },
    {
      id: "vhs-course",
      stepNumber: 6,
      stepLabel: "06",
      eyebrow: "Open Ried Sens",
      title: "Unser Vorschlag für einen Sensorkurs",
      lead: "In drei Terminen schrittweise bauen, Messwerte verstehen und gemeinsam auswerten.",
      layout: "story",
      bullets: [
        {
          title: "Bau und Inbetriebnahme",
          description:
            "Werkzeuge kennenlernen, Sensor montieren und eine geeignete Verbindung prüfen.",
        },
        {
          title: "Auswertung und Mitforschen",
          description:
            "Eigene Werte verstehen und Fragen entwickeln. Dauer und Schwierigkeitsgrad im Pilot erproben.",
        },
      ],
      imageVisual: {
        src: "/pitch/schul-stem-workshop.jpg",
        alt: "Illustration eines möglichen VHS-Kurses",
      },
    },
    {
      id: "vhs-course-plan",
      stepNumber: 7,
      stepLabel: "07",
      eyebrow: "Open Ried Sens",
      title: "Nach dem Kurs weiterforschen",
      lead: "Eine eigene Station kann zum Einstieg in Bürgerwissenschaft und den Hackathon werden.",
      layout: "story",
      bullets: [
        {
          title: "Zu Hause oder gemeinsam",
          description:
            "Geeigneten Standort und Verbindung prüfen. Ergebnisse mit anderen Teilnehmenden teilen.",
        },
        {
          title: "Kursorganisation",
          description:
            "Räume, Dozenten, Werkzeuge, Materialkosten, Gebühren und Ausschreibungsfrist gemeinsam abstimmen.",
        },
      ],
    },
    {
      id: "vhs-next-step",
      stepNumber: 8,
      stepLabel: "08",
      eyebrow: "Open Ried Sens",
      title: "Unsere Bitte an die VHS",
      lead: "Einen Pilotkurs gemeinsam konkretisieren und anschließend die Aufnahme ins Programm prüfen.",
      layout: "the-ask-commitment",
      bullets: [],
      specificAsks: [
        {
          id: "vhs-program",
          title: "Kontakt zur Programmplanung",
          description: "Zielgruppe, Termin und Ausschreibung abstimmen.",
          commitmentType: "schulen",
          tag: "Nächster Schritt",
          actionText: "Termin vereinbaren",
        },
        {
          id: "vhs-roles",
          title: "Aufgaben und Kosten vereinbaren",
          description:
            "Die Initiative bringt Fachwissen und Kursidee ein. Dozenten, Werkzeuge, Räume und Finanzierung verbindlich abstimmen.",
          commitmentType: "infrastruktur",
          tag: "Nächster Schritt",
          actionText: "Termin vereinbaren",
        },
      ],
    },
    {
      id: "vhs-bonus",
      title: "Bewegung im Ried",
      lead: "",
      layout: "collected-evidence",
      eyebrow: "Open Ried Sens",
      bullets: [],
      stepNumber: 9,
      stepLabel: "09",
    },
  ],
};

export const WIRTSCHAFT_DECK: PitchDeck = {
  slug: "wirtschaft",
  title: "Unternehmen unterstützen Sensorbau und Hackathon",
  subtitle:
    "Eine Bürgerinitiative für das Ried: vorhandene Daten nutzen, eigene Sensoren bauen und beim Hackathon gemeinsam Ideen entwickeln.",
  targetAudience: "Regionale Unternehmen und Stadtwerke",
  category: "wirtschaft",
  badge: "Wirtschaft & Stadtwerke",
  accentColor: "amber",
  estimatedMinutes: 10,
  summary:
    "Bausätze, Fachwissen oder den Hackathon unterstützen. Unternehmen und Stadtwerke wählen einen konkreten ersten Beitrag.",
  slides: [
    {
      id: "wirtschaft-team",
      stepNumber: 1,
      stepLabel: "01",
      eyebrow: "Open Ried Sens",
      title: "Unser Team im Ried",
      lead: "Wir sind drei Menschen aus der Region und möchten gemeinsam einen Hackathon für das Ried organisieren.",
      layout: "team-showcase",
      teamMembers: CORE_TEAM_MEMBERS,
      bullets: [],
    },
    {
      id: "wirtschaft-hackathon",
      stepNumber: 2,
      stepLabel: "02",
      eyebrow: "Open Ried Sens",
      title: "Was ist ein Hackathon?",
      lead: "Ein Hackathon bringt Menschen zusammen, um gemeinsam an Ideen für unsere Region zu arbeiten.",
      layout: "story",
      bullets: [
        {
          title: "Gemeinsam an regionalen Fragen arbeiten",
          description:
            "Bürger, Jugendliche, Entwickler und Fachleute lernen voneinander und entwickeln erste Prototypen.",
        },
        {
          title: "Kostenlos für die Politik",
          description:
            "Wir organisieren den Hackathon als Bürgerinitiative. Die Politik kann ihn ohne verpflichtenden finanziellen Beitrag unterstützen.",
        },
      ],
      imageVisual: {
        src: "/pitch/hackathon-kamue-community.jpg",
        alt: "Illustration gemeinsamer Projektarbeit beim Hackathon",
        caption: "Idee für das gemeinsame Arbeiten im KAMÜ",
      },
    },
    {
      id: "wirtschaft-origin",
      stepNumber: 3,
      stepLabel: "03",
      eyebrow: "Open Ried Sens",
      title: "Die Daten aus dem Smart-City-Projekt",
      lead: "Bürstadt und Lampertheim haben Messdaten geschaffen. Wir möchten die dahinterliegenden Rohdaten für eigene Auswertungen nutzen.",
      layout: "website",
      website: {
        src: "https://smartcity-system.de/buerstadt/dashboard_uebersicht",
        title: "Smart-City-Dashboard Bürstadt und Lampertheim",
      },
    },
    {
      id: "wirtschaft-collected",
      stepNumber: 4,
      stepLabel: "04",
      eyebrow: "Open Ried Sens",
      title: "Unsere Datenbasis für den Hackathon",
      lead: "Wir haben uns zum Ziel gemacht, weitere Open-Data-Daten für das Ried zu sammeln. Daraus ist die Open-Ried-Sens-Website als Datenbasis für den Hackathon entstanden.",
      layout: "website",
      website: {
        src: "/?cats=all#ried-map",
        title: "Open Ried Sens: Karte der gesammelten Regionaldaten",
      },
    },
    {
      id: "wirtschaft-sensors",
      title: "Sensorbau als gemeinsames Schülerprojekt",
      lead: "Für das ganze Ried fehlen uns noch ausreichend zugängliche Rohdaten. Deshalb möchten wir als Bürgerinitiative eigene smarte Sensoren bauen.",
      layout: "story",
      eyebrow: "Open Ried Sens",
      bullets: [
        {
          title: "Mit Schulen und Interessierten",
          description:
            "Jugendliche bauen Sensoren gemeinsam mit uns. VHS und weitere Interessierte können ebenfalls mitmachen.",
        },
        {
          title: "Weitere Umweltdaten sammeln",
          description:
            "Zum Beispiel Feinstaub und Luftqualität in Bürstadt und im Ried messen. Die Daten können Teams beim Hackathon untersuchen.",
        },
      ],
      imageVisual: {
        src: "/pitch/sensor-hardware-kit.jpg",
        alt: "Sensorbausatz für das gemeinsame Bildungsprojekt",
        caption: "Eigene Messstationen ergänzen vorhandene Daten.",
      },
      stepNumber: 5,
      stepLabel: "05",
    },
    {
      id: "wirtschaft-school-bridge",
      title: "So könnte ein erster Projekttag aussehen",
      lead: "Mit einer Partnerschule beginnen und später weitere Schulen im Ried einbeziehen.",
      layout: "story",
      eyebrow: "Open Ried Sens",
      bullets: [
        {
          title: "Gemeinsam bauen und verstehen",
          description:
            "Interessierte Jugendliche über Lehrkräfte, MINT-AGs oder Jugend forscht ansprechen. Betreuung, Material und Finanzierung vorab gemeinsam planen.",
        },
        {
          title: "Zu Hause weiterforschen",
          description:
            "Bei geeignetem Standort und mit Zustimmung der Familie kann der Sensor zu Hause stehen. Jugendliche zeigen ihre Ergebnisse und laden Familie und Nachbarn zum Hackathon ein.",
        },
      ],
      imageVisual: {
        src: "/pitch/schul-stem-workshop.jpg",
        alt: "Illustration eines möglichen Schulprojekttags",
        caption: "Interesse genügt. Vorkenntnisse sind keine Voraussetzung.",
      },
      stepNumber: 6,
      stepLabel: "06",
    },
    {
      id: "wirtschaft-participation",
      stepNumber: 7,
      stepLabel: "07",
      eyebrow: "Open Ried Sens",
      title: "So kann Ihr Betrieb mitmachen",
      lead: "Regionale Bildungsförderung ist ein konkreter Beitrag zu CSR (Corporate Social Responsibility).",
      layout: "story",
      bullets: [
        {
          title: "Bausätze oder Veranstaltung unterstützen",
          description:
            "Material für Schüler, Sachpreise oder Catering ermöglichen. Umfang und Kosten gemeinsam festlegen.",
        },
        {
          title: "Fachwissen einbringen",
          description:
            "Mentoren oder eine geeignete Firmen-Challenge anbieten. Ein Workshop mit Azubis ist eine weitere Möglichkeit.",
        },
      ],
    },
    {
      id: "wirtschaft-scope",
      stepNumber: 8,
      stepLabel: "08",
      eyebrow: "Open Ried Sens",
      title: "Ein passender erster Beitrag",
      lead: "Wir stimmen eine überschaubare Beteiligung mit Ihnen ab.",
      layout: "story",
      bullets: [
        {
          title: "Für Unternehmen",
          description:
            "Einen Projekttag oder Hackathon-Beitrag wählen. Bausatzkosten prüfen, bevor ein Komplettpreis zugesagt wird.",
        },
        {
          title: "Für Stadtwerke",
          description:
            "Datenzugänge, Betreiberwissen oder Infrastruktur prüfen. LoRaWAN einfach erklärt: Funk für kleine Sensorpakete, dessen Empfang und Bedingungen wir am Standort testen müssen.",
        },
      ],
    },
    {
      id: "wirtschaft-next-step",
      stepNumber: 9,
      stepLabel: "09",
      eyebrow: "Open Ried Sens",
      title: "Unsere Bitte an Ihr Unternehmen",
      lead: "Eine Beteiligungsform wählen und einen Ansprechpartner für die Ausarbeitung benennen.",
      layout: "the-ask-commitment",
      bullets: [],
      specificAsks: [
        {
          id: "business-sponsor",
          title: "Sensorbau oder Hackathon fördern",
          description:
            "Einzelne Bausätze, einen Projekttag oder einen Veranstaltungsbeitrag gemeinsam kalkulieren.",
          commitmentType: "finanzen",
          tag: "Nächster Schritt",
          actionText: "Termin vereinbaren",
        },
        {
          id: "business-challenge",
          title: "Mentoring, Challenge oder Infrastruktur",
          description:
            "Ein geeignetes Thema oder einen prüfbaren Daten- und Infrastrukturbeitrag vereinbaren.",
          commitmentType: "infrastruktur",
          tag: "Nächster Schritt",
          actionText: "Termin vereinbaren",
        },
      ],
    },
    {
      id: "wirtschaft-bonus",
      title: "Bewegung im Ried",
      lead: "",
      layout: "collected-evidence",
      eyebrow: "Open Ried Sens",
      bullets: [],
      stepNumber: 10,
      stepLabel: "10",
    },
  ],
};

export const PITCH_DECKS: PitchDeck[] = [
  POLITIK_DECK,
  SCHULEN_DECK,
  VHS_DECK,
  WIRTSCHAFT_DECK,
];

export function getPitchDeckBySlug(slug: string): PitchDeck | undefined {
  return PITCH_DECKS.find((deck) => deck.slug === slug);
}
