export interface SourceItem {
  source_id: string;
  source_url: string | null;
  enabled: boolean | null;
  interval_seconds: number | null;
  received_at: string | null;
  status: string;
  last_success_at: string | null;
  error?: string | null;
  http_status?: number | null;
  fetched_at?: string | null;
  processed_at?: string | null;
  last_fetch_success_at?: string | null;
  last_processed_at?: string | null;
  completion_recorded?: boolean;
  item_count?: number | null;
  item_count_unit?: string | null;
  published_dataset_count?: number | null;
  error_stage?: string | null;
}


export const SOURCE_INFO: Record<
  string,
  {
    title: string;
    domain: string;
    provider: string;
  }
> = {
  "vrn-realtime": {
    title: "VRN GTFS-Realtime (Live-Fahrplandaten)",
    domain: "Mobilität & ÖPNV",
    provider: "Verkehrsverbund Rhein-Neckar",
  },
  vrn: {
    title: "VRN Soll-Fahrplan & Netz (GTFS)",
    domain: "Mobilität & ÖPNV",
    provider: "Verkehrsverbund Rhein-Neckar",
  },
  "delfi-regional-gtfsde": {
    title: "DELFI Bundesweiter ÖPNV-Fahrplan",
    domain: "Mobilität & ÖPNV",
    provider: "DELFI e.V. / Bund & Länder",
  },
  "zakb-calendar": {
    title: "ZAKB Abfallkalender & Leerungstermine",
    domain: "Abfall & Kreislauf",
    provider: "Zweckverband Abfallwirtschaft Kreis Bergstraße",
  },
  "bkg-topplus": {
    title: "BKG TopPlus-Open Raster-Karten",
    domain: "Karten & Geodaten",
    provider: "Bundesamt für Kartographie und Geodäsie",
  },
  "bnetza-chargers": {
    title: "BNetzA Öffentliches Ladesäulenregister",
    domain: "Infrastruktur & E-Mobilität",
    provider: "Bundesnetzagentur",
  },
  "cross7-buerstadt": {
    title: "Cross-7 Veranstaltungskalender",
    domain: "Kultur & Termine",
    provider: "Stadt Bürstadt / Cross-7",
  },
  "hvbg-boris-2024": {
    title: "Amtliche Bodenrichtwertzonen · Stichtag 01.01.2024",
    domain: "Bauen & Wohnen",
    provider: "HVBG · BORIS Hessen",
  },
  "bnetza-broadband-households": {
    title: "Breitbandverfügbarkeit für Privathaushalte",
    domain: "Infrastruktur & Konnektivität",
    provider: "Bundesnetzagentur · Breitbandatlas",
  },
  "hessen-municipal-statistics": {
    title: "Hessische Gemeindestatistik",
    domain: "Statistik & Finanzen",
    provider: "Hessisches Statistisches Landesamt (HSL)",
  },
  "bundeswahlleiterin-2025": {
    title: "Bundestagswahl Wahlbezirke & Ergebnisse",
    domain: "Wahlen & Demokratie",
    provider: "Die Bundeswahlleiterin",
  },
  "osm-regional-addresses": {
    title: "OpenStreetMap Straßen & Adressregister",
    domain: "Karten & Geodaten",
    provider: "OpenStreetMap / Geofabrik Hessen",
  },
  "biblis-adopted-budget": {
    title: "Haushaltsplan der Gemeinde Biblis",
    domain: "Statistik & Finanzen",
    provider: "Gemeinde Biblis",
  },
  "environment-pegel": {
    title: "Pegelstand Rhein bei Worms",
    domain: "Umwelt & Gewässer",
    provider: "Wasserstraßen- und Schifffahrtsverwaltung des Bundes / PEGELONLINE",
  },
  "environment-weather": {
    title: "ICON-Wettermodell für das Ried",
    domain: "Umwelt & Gewässer",
    provider: "Deutscher Wetterdienst / Open-Meteo",
  },
  "environment-radolan": {
    title: "DWD RADOLAN Niederschlagsradar",
    domain: "Umwelt & Gewässer",
    provider: "Deutscher Wetterdienst (DWD Open Data)",
  },
  "environment-mosmix": {
    title: "DWD MOSMIX Stationsvorhersage",
    domain: "Umwelt & Gewässer",
    provider: "Deutscher Wetterdienst (DWD Open Data)",
  },
  "hlnug-groundwater": {
    title: "HLNUG Grundwassermessstellen Ried",
    domain: "Umwelt & Gewässer",
    provider: "Hessisches Landesamt für Naturschutz, Umwelt und Geologie (HLNUG)",
  },
  "autobahn-inventory-a67-electric_charging_station": {
    title: "Autobahn A67 · Ladeangebote · Anbieterinventar ohne Live-Belegung",
    domain: "Mobilität & Infrastruktur",
    provider: "Die Autobahn GmbH des Bundes",
  },
  "autobahn-inventory-a67-parking_lorry": {
    title: "Autobahn A67 · Rastplätze · PKW-/LKW-Inventar",
    domain: "Mobilität & Infrastruktur",
    provider: "Die Autobahn GmbH des Bundes",
  },
  "autobahn-webcam-discovery-a67": {
    title: "Autobahn A67 · Webcam-Suche (Metadaten)",
    domain: "Mobilität & Infrastruktur",
    provider: "Die Autobahn GmbH des Bundes",
  },
  "autobahn-inventory-a5-electric_charging_station": {
    title: "Autobahn A5 · Ladeangebote · Anbieterinventar ohne Live-Belegung",
    domain: "Mobilität & Infrastruktur",
    provider: "Die Autobahn GmbH des Bundes",
  },
  "autobahn-inventory-a5-parking_lorry": {
    title: "Autobahn A5 · Rastplätze · PKW-/LKW-Inventar",
    domain: "Mobilität & Infrastruktur",
    provider: "Die Autobahn GmbH des Bundes",
  },
  "autobahn-webcam-discovery-a5": {
    title: "Autobahn A5 · Webcam-Suche (Metadaten)",
    domain: "Mobilität & Infrastruktur",
    provider: "Die Autobahn GmbH des Bundes",
  },
  "autobahn-inventory-a6-electric_charging_station": {
    title: "Autobahn A6 · Ladeangebote · Anbieterinventar ohne Live-Belegung",
    domain: "Mobilität & Infrastruktur",
    provider: "Die Autobahn GmbH des Bundes",
  },
  "autobahn-inventory-a6-parking_lorry": {
    title: "Autobahn A6 · Rastplätze · PKW-/LKW-Inventar",
    domain: "Mobilität & Infrastruktur",
    provider: "Die Autobahn GmbH des Bundes",
  },
  "autobahn-webcam-discovery-a6": {
    title: "Autobahn A6 · Webcam-Suche (Metadaten)",
    domain: "Mobilität & Infrastruktur",
    provider: "Die Autobahn GmbH des Bundes",
  },
  "traffic-corridors": {
    title: "Verkehrsfluss & Stauvolumen Ried",
    domain: "Mobilität & ÖPNV",
    provider: "Die Autobahn & TomTom Flow / Korridor-Modell",
  },
  "environment-xweather": {
    title: "Blitzortung Blitzimpulse im Ried (5 Minuten)",
    domain: "Umwelt & Wetter",
    provider: "Vaisala Xweather Lightning Network",
  },
  "environment-blitzortung": {
    title: "Blitzortung Live-Gewitterüberwachung",
    domain: "Umwelt & Wetter",
    provider: "Blitzortung.org Community Network",
  },
  "invekos-agriculture": {
    title: "INVEKOS Landwirtschaftliche Parzellen & Feldblöcke",
    domain: "Landwirtschaft & Boden",
    provider: "Land Hessen (HMLU / GDI-Hessen)",
  },
  "copernicus-sentinel2": {
    title: "Copernicus Sentinel-2 Satellitenbilder",
    domain: "Umwelt & Erdbeobachtung",
    provider: "Europäische Weltraumorganisation (ESA / Copernicus)",
  },
  "rast-monitor": {
    title: "Rast-Monitor (LKW-Rastplätze Autobahn)",
    domain: "Mobilität & Verkehr",
    provider: "Toll Collect / Mobilithek / rast-monitor.de",
  },
  opensensemap: {
    title: "openSenseMap & senseBox (Bürger-Sensornetzwerk)",
    domain: "Umwelt & Luftqualität",
    provider: "re:edu / Universität Münster & Citizen Science Community",
  },
  uba: {
    title: "Umweltbundesamt (UBA) Luftdaten",
    domain: "Umwelt & Luftqualität",
    provider: "Umweltbundesamt (UBA)",
  },
  "hessen-verkehr": {
    title: "Verkehrsservice Hessen (Hessen Mobil)",
    domain: "Mobilität & Verkehr",
    provider: "Landesverkehrszentrale Hessen / Hessen Mobil",
  },
  "bnetza-emf": {
    title: "Funkanlagen & Standortbescheinigungen",
    domain: "Infrastruktur & Funk",
    provider: "Bundesnetzagentur",
  },
  "ttnmapper": {
    title: "LoRaWAN-Gateways im Ried",
    domain: "Sensorik & Funk",
    provider: "Packet Broker / TTN Mapper",
  },
  "db-openstation-netex": {
    title: "Bahnhöfe & Ausstattung (NeTEx)",
    domain: "Mobilität & ÖPNV",
    provider: "Deutsche Bahn / OpenStation",
  },
  "db-openstation-siri-fm": {
    title: "Aktuelle Aufzugs- & Rolltreppenmeldungen",
    domain: "Mobilität & ÖPNV",
    provider: "Deutsche Bahn / OpenStation",
  },
  "db-fasta": {
    title: "Aufzüge & Rolltreppen (FaSta)",
    domain: "Mobilität & ÖPNV",
    provider: "Deutsche Bahn",
  },
  "db-ris-boards": {
    title: "Bahnhofsabfahrten (RIS Boards)",
    domain: "Mobilität & ÖPNV",
    provider: "Deutsche Bahn",
  },
  "db-ris-stations": {
    title: "Bahnhofsinformationen (RIS Stations)",
    domain: "Mobilität & ÖPNV",
    provider: "Deutsche Bahn",
  },
  "cross7-gross-rohrheim": {
    title: "Veranstaltungskalender Groß-Rohrheim",
    domain: "Kultur & Termine",
    provider: "Gemeinde Groß-Rohrheim / Cross-7",
  },
  "lampertheim-events": {
    title: "Veranstaltungskalender Lampertheim",
    domain: "Kultur & Termine",
    provider: "Stadt Lampertheim",
  },
  "buergerstiftung-biblis-events": {
    title: "Veranstaltungen der Bürgerstiftung Biblis",
    domain: "Kultur & Termine",
    provider: "Bürgerstiftung Biblis",
  },
  "dlrg-lampertheim-events": {
    title: "Kurse & Termine der DLRG Lampertheim",
    domain: "Kultur & Termine",
    provider: "DLRG Ortsverband Lampertheim",
  },
  "sg-huettenfeld-events": {
    title: "Veranstaltungen der SG Hüttenfeld",
    domain: "Kultur & Termine",
    provider: "SG 1946 Hüttenfeld",
  },
  "kkm-buerstadt-events": {
    title: "Veranstaltungen der KKM Bürstadt",
    domain: "Kultur & Termine",
    provider: "KKM Bürstadt",
  },
  "hofheimer-volkslauf": {
    title: "Hofheimer Volkslauf",
    domain: "Sport & Termine",
    provider: "TV 1896 Hofheim/Ried",
  },
  "tv-hofheim-events": {
    title: "Veranstaltungen des TV Hofheim",
    domain: "Sport & Termine",
    provider: "TV 1896 Hofheim/Ried",
  },
  "tv-buerstadt-events": {
    title: "Veranstaltungen des TV Bürstadt",
    domain: "Sport & Termine",
    provider: "TV 1891 Bürstadt",
  },
  "neuschloss-events": {
    title: "Veranstaltungskalender Neuschloß",
    domain: "Kultur & Termine",
    provider: "Lampertheim-Neuschloß",
  },
  "adsblol-ried": {
    title: "Empfangene Flugzeugpositionen im Ried",
    domain: "Mobilität & Luftverkehr",
    provider: "adsb.lol",
  },
  "ogn-ried": {
    title: "Empfangene Segelflugpositionen im Ried",
    domain: "Mobilität & Luftverkehr",
    provider: "Open Glider Network",
  },
  "aisstream-rhein": {
    title: "Empfangene Schiffspositionen auf dem Rhein",
    domain: "Mobilität & Schifffahrt",
    provider: "AISstream",
  },
  "rhein-map": {
    title: "Schiffsempfang Frankenthal–Gernsheim",
    domain: "Mobilität & Schifffahrt",
    provider: "Rhein-Karten-Datenfeed",
  },
  "environment-gbif": {
    title: "Artenbeobachtungen im Ried",
    domain: "Umwelt & Artenvielfalt",
    provider: "Global Biodiversity Information Facility (GBIF)",
  },
  "environment-soil-icon": {
    title: "Bodenmodell ICON",
    domain: "Umwelt & Boden",
    provider: "Deutscher Wetterdienst",
  },
  "environment-pollen-cams": {
    title: "Pollenmodell CAMS",
    domain: "Umwelt & Gesundheit",
    provider: "Copernicus Atmosphere Monitoring Service",
  },
  "environment-discharge-glofas": {
    title: "Abflussvorhersage GloFAS",
    domain: "Umwelt & Gewässer",
    provider: "Copernicus Emergency Management Service",
  },
  "copernicus-sentinel2:raster": {
    title: "Sentinel-2 Rasterverarbeitung",
    domain: "Umwelt & Erdbeobachtung",
    provider: "ESA / Copernicus",
  },
  "demographics-published-source": { title: "Demografiedaten", domain: "Bevölkerung", provider: "Anbieter noch nicht hinterlegt" },
  "realestate-published-source": { title: "Immobiliendaten", domain: "Bauen & Wohnen", provider: "Anbieter noch nicht hinterlegt" },
  "economy-published-source": { title: "Wirtschaftsdaten", domain: "Wirtschaft", provider: "Anbieter noch nicht hinterlegt" },
  "finance-published-source": { title: "Finanzdaten", domain: "Finanzen", provider: "Anbieter noch nicht hinterlegt" },
  "elections-published-source": { title: "Wahldaten", domain: "Wahlen", provider: "Anbieter noch nicht hinterlegt" },
  "environment-published-source": { title: "Weitere Umweltdaten", domain: "Umwelt", provider: "Anbieter noch nicht hinterlegt" },
  "social-published-source": { title: "Weitere Sozialdaten", domain: "Soziales", provider: "Anbieter noch nicht hinterlegt" },
  "infrastructure-published-source": { title: "Weitere Infrastrukturdaten", domain: "Infrastruktur", provider: "Anbieter noch nicht hinterlegt" },
  "traffic-published-source": { title: "Weitere Verkehrsdaten", domain: "Verkehr", provider: "Anbieter noch nicht hinterlegt" },
  "energy-meter-feed": { title: "Gemessene Energieerzeugung", domain: "Energie", provider: "Anbieter noch nicht hinterlegt" },
};
