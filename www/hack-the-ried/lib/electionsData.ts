import { collectedFetch as fetch } from "./collectedBackend";
import { env } from "@/env";

export interface ElectionPartyResult {
  name: string;
  color: string;
  votes: number;
  percent: number;
  seats?: number;
}

export interface ElectionCandidateResult {
  name: string;
  votes: number;
  percent: number;
  elected: boolean;
}

export interface ElectionEvent {
  id: string;
  municipality: string;
  election_type: "kommunalwahl" | "buergermeister" | "landtag" | "bundestag" | "europawahl";
  title: string;
  election_date: string;
  eligible_voters: number;
  total_voters: number;
  turnout_percent: number;
  valid_votes: number;
  invalid_votes: number;
  seats_total?: number | null;
  results_summary: {
    parties?: ElectionPartyResult[];
    candidates?: ElectionCandidateResult[];
  };
  source?: string | null;
  source_url?: string | null;
}

export interface ElectionDistrictFeature {
  type: "Feature";
  id: string;
  geometry: {
    type: "Polygon" | "Point";
    coordinates: number[][][] | number[];
  };
  properties: {
    district_id: string;
    district_number: string;
    name: string;
    polling_station_name?: string | null;
    polling_station_address?: string | null;
    center_lat: number;
    center_lng: number;
    eligible_voters?: number;
    total_voters?: number;
    turnout_percent?: number;
    valid_votes?: number;
    invalid_votes?: number;
    party_results?: Record<string, number>;
    winning_party?: string | null;
  };
}

export interface ElectionDistrictsGeoJSON {
  type: "FeatureCollection";
  election_id: string;
  election_title: string;
  municipality: string;
  features: ElectionDistrictFeature[];
}

export const BASELINE_ELECTIONS: ElectionEvent[] = [
  {
    id: "kw-2021-bst",
    municipality: "Bürstadt",
    election_type: "kommunalwahl",
    title: "Kommunalwahl 2021 – Stadtverordnetenversammlung",
    election_date: "2021-03-14",
    eligible_voters: 12450,
    total_voters: 6420,
    turnout_percent: 51.57,
    valid_votes: 6185,
    invalid_votes: 235,
    seats_total: 31,
    results_summary: {
      parties: [
        { name: "CDU", color: "#1e293b", votes: 75850, percent: 45.8, seats: 14 },
        { name: "SPD", color: "#ef4444", votes: 41200, percent: 24.9, seats: 8 },
        { name: "Bündnis 90/Die Grünen", color: "#22c55e", votes: 26800, percent: 16.2, seats: 5 },
        { name: "FDP", color: "#eab308", votes: 21750, percent: 13.1, seats: 4 },
      ],
    },
    source_url: "https://votemanager.ekom21.de/2021-03-14/06431005/praesentation/",
  },
  {
    id: "bm-2023-bst",
    municipality: "Bürstadt",
    election_type: "buergermeister",
    title: "Bürgermeisterwahl 2023 Bürstadt",
    election_date: "2023-03-12",
    eligible_voters: 12620,
    total_voters: 5980,
    turnout_percent: 47.38,
    valid_votes: 5910,
    invalid_votes: 70,
    results_summary: {
      candidates: [
        { name: "Barbara Schader (CDU)", votes: 3487, percent: 59.0, elected: true },
        { name: "Boris Wenz (Bürger / Unabhängig)", votes: 2423, percent: 41.0, elected: false },
      ],
    },
    source_url: "https://votemanager.ekom21.de/2023-03-12/06431005/praesentation/",
  },
  {
    id: "kw-2021-la",
    municipality: "Lampertheim",
    election_type: "kommunalwahl",
    title: "Kommunalwahl 2021 – Stadtverordnetenversammlung",
    election_date: "2021-03-14",
    eligible_voters: 24800,
    total_voters: 11950,
    turnout_percent: 48.19,
    valid_votes: 11520,
    invalid_votes: 430,
    seats_total: 45,
    results_summary: {
      parties: [
        { name: "CDU", color: "#1e293b", votes: 162400, percent: 34.2, seats: 15 },
        { name: "SPD", color: "#ef4444", votes: 158200, percent: 33.3, seats: 15 },
        { name: "FDP", color: "#eab308", votes: 79500, percent: 16.7, seats: 8 },
        { name: "Bündnis 90/Die Grünen", color: "#22c55e", votes: 75100, percent: 15.8, seats: 7 },
      ],
    },
    source_url: "https://votemanager.ekom21.de/2021-03-14/06431013/praesentation/",
  },
  {
    id: "kw-2021-bib",
    municipality: "Biblis",
    election_type: "kommunalwahl",
    title: "Kommunalwahl 2021 – Gemeindevertretung",
    election_date: "2021-03-14",
    eligible_voters: 6950,
    total_voters: 3680,
    turnout_percent: 52.95,
    valid_votes: 3570,
    invalid_votes: 110,
    seats_total: 31,
    results_summary: {
      parties: [
        { name: "CDU", color: "#1e293b", votes: 41200, percent: 42.5, seats: 13 },
        { name: "SPD", color: "#ef4444", votes: 25800, percent: 26.6, seats: 8 },
        { name: "FLB (Freie Liste)", color: "#0284c7", votes: 18400, percent: 19.0, seats: 6 },
        { name: "Bündnis 90/Die Grünen", color: "#22c55e", votes: 11500, percent: 11.9, seats: 4 },
      ],
    },
    source_url: "https://votemanager.ekom21.de/2021-03-14/06431003/praesentation/",
  },
  {
    id: "eu-2024-bst",
    municipality: "Bürstadt",
    election_type: "europawahl",
    title: "Europawahl 2024 – Bürstadt",
    election_date: "2024-06-09",
    eligible_voters: 12750,
    total_voters: 7840,
    turnout_percent: 61.49,
    valid_votes: 7755,
    invalid_votes: 85,
    results_summary: {
      parties: [
        { name: "CDU", color: "#1e293b", votes: 2840, percent: 36.6 },
        { name: "AfD", color: "#0ea5e9", votes: 1420, percent: 18.3 },
        { name: "SPD", color: "#ef4444", votes: 1210, percent: 15.6 },
        { name: "Bündnis 90/Die Grünen", color: "#22c55e", votes: 720, percent: 9.3 },
        { name: "FDP", color: "#eab308", votes: 485, percent: 6.3 },
        { name: "BSW", color: "#d946ef", votes: 410, percent: 5.3 },
        { name: "Sonstige", color: "#64748b", votes: 670, percent: 8.6 },
      ],
    },
    source_url: "https://votemanager.ekom21.de/2024-06-09/06431005/praesentation/",
  },
];

export const BASELINE_DISTRICTS_GEOJSON: Record<string, ElectionDistrictsGeoJSON> = {
  "kw-2021-bst": {
    type: "FeatureCollection",
    election_id: "kw-2021-bst",
    election_title: "Kommunalwahl 2021 – Bürstadt",
    municipality: "Bürstadt",
    features: [
      {
        type: "Feature",
        id: "ed-bst-01",
        geometry: {
          type: "Polygon",
          coordinates: [[[8.455, 49.646], [8.468, 49.646], [8.468, 49.654], [8.455, 49.654], [8.455, 49.646]]],
        },
        properties: {
          district_id: "ed-bst-01",
          district_number: "01",
          name: "Bürstadt 01 – Schillerschule",
          polling_station_name: "Schillerschule (Aula)",
          polling_station_address: "Boxheimerhofstraße 18",
          center_lat: 49.6495,
          center_lng: 8.4615,
          eligible_voters: 2150,
          total_voters: 1140,
          turnout_percent: 53.02,
          valid_votes: 1098,
          invalid_votes: 42,
          party_results: { CDU: 482, SPD: 284, Gruene: 182, FDP: 150 },
          winning_party: "CDU",
        },
      },
      {
        type: "Feature",
        id: "ed-bst-02",
        geometry: {
          type: "Polygon",
          coordinates: [[[8.448, 49.638], [8.460, 49.638], [8.460, 49.646], [8.448, 49.646], [8.448, 49.638]]],
        },
        properties: {
          district_id: "ed-bst-02",
          district_number: "02",
          name: "Bürstadt 02 – Altes Rathaus / Marktplatz",
          polling_station_name: "Historisches Rathaus (Ratssaal)",
          polling_station_address: "Marktplatz 1",
          center_lat: 49.6415,
          center_lng: 8.4545,
          eligible_voters: 2080,
          total_voters: 1020,
          turnout_percent: 49.04,
          valid_votes: 982,
          invalid_votes: 38,
          party_results: { CDU: 456, SPD: 268, Gruene: 142, FDP: 116 },
          winning_party: "CDU",
        },
      },
      {
        type: "Feature",
        id: "ed-bst-03",
        geometry: {
          type: "Polygon",
          coordinates: [[[8.460, 49.643], [8.475, 49.643], [8.475, 49.652], [8.460, 49.652], [8.460, 49.643]]],
        },
        properties: {
          district_id: "ed-bst-03",
          district_number: "03",
          name: "Bürstadt 03 – EKS Gesamtschule",
          polling_station_name: "Erich-Kästner-Schule (Mensa)",
          polling_station_address: "Wolfstraße 23",
          center_lat: 49.648,
          center_lng: 8.466,
          eligible_voters: 2280,
          total_voters: 1180,
          turnout_percent: 51.75,
          valid_votes: 1140,
          invalid_votes: 40,
          party_results: { CDU: 512, SPD: 298, Gruene: 194, FDP: 136 },
          winning_party: "CDU",
        },
      },
      {
        type: "Feature",
        id: "ed-bst-04",
        geometry: {
          type: "Polygon",
          coordinates: [[[8.450, 49.630], [8.468, 49.630], [8.468, 49.638], [8.450, 49.638], [8.450, 49.630]]],
        },
        properties: {
          district_id: "ed-bst-04",
          district_number: "04",
          name: "Bürstadt 04 – Jugendhaus Balla-Balla",
          polling_station_name: "Jugendhaus Balla-Balla",
          polling_station_address: "Wasserwerkstraße 4",
          center_lat: 49.6385,
          center_lng: 8.459,
          eligible_voters: 1950,
          total_voters: 930,
          turnout_percent: 47.69,
          valid_votes: 895,
          invalid_votes: 35,
          party_results: { CDU: 388, SPD: 265, Gruene: 128, FDP: 114 },
          winning_party: "CDU",
        },
      },
      {
        type: "Feature",
        id: "ed-bst-05",
        geometry: {
          type: "Polygon",
          coordinates: [[[8.435, 49.654], [8.458, 49.654], [8.458, 49.671], [8.435, 49.671], [8.435, 49.654]]],
        },
        properties: {
          district_id: "ed-bst-05",
          district_number: "05",
          name: "Bürstadt 05 – Stadtteil Bobstadt",
          polling_station_name: "Bürgerhaus Bobstadt",
          polling_station_address: "Frankenstraße 1",
          center_lat: 49.6625,
          center_lng: 8.4465,
          eligible_voters: 2120,
          total_voters: 1185,
          turnout_percent: 55.9,
          valid_votes: 1145,
          invalid_votes: 40,
          party_results: { CDU: 542, SPD: 282, Gruene: 178, FDP: 143 },
          winning_party: "CDU",
        },
      },
      {
        type: "Feature",
        id: "ed-bst-06",
        geometry: {
          type: "Polygon",
          coordinates: [[[8.478, 49.638], [8.505, 49.638], [8.505, 49.656], [8.478, 49.656], [8.478, 49.638]]],
        },
        properties: {
          district_id: "ed-bst-06",
          district_number: "06",
          name: "Bürstadt 06 – Stadtteil Riedrode",
          polling_station_name: "Bürgerhaus Riedrode",
          polling_station_address: "Bahnhofstraße 14",
          center_lat: 49.6475,
          center_lng: 8.491,
          eligible_voters: 1870,
          total_voters: 965,
          turnout_percent: 51.6,
          valid_votes: 925,
          invalid_votes: 40,
          party_results: { CDU: 448, SPD: 235, Gruene: 128, FDP: 114 },
          winning_party: "CDU",
        },
      },
    ],
  },
};

export async function fetchElections(municipality?: string): Promise<ElectionEvent[]> {

    const url = new URL("/api/v1/elections", env.BACKEND_API_URL);
    if (municipality) url.searchParams.set("municipality", municipality);
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (res.ok) return await res.json();

  throw new Error("Collected data unavailable");
}

export async function fetchElectionDistricts(electionId: string): Promise<ElectionDistrictsGeoJSON | null> {

    const url = new URL(`/api/v1/elections/${electionId}/districts`, env.BACKEND_API_URL);
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (res.ok) return await res.json();

  throw new Error("Collected data unavailable");
}
