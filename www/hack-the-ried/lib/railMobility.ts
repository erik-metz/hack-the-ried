/**
 * Mobility and Bahnübergänge engine for the Hessian Ried.
 * Tracks moving trains in the Ried corridor with entry/exit geofencing,
 * station dwell visualization, animated departure gauges, and
 * level crossing status prediction.
 */

export interface LatLngPoint {
  lat: number;
  lng: number;
}

export interface RailStation {
  id: string;
  name: string;
  evaNumber: string;
  line: "Riedbahn" | "Nibelungenbahn";
  lat: number;
  lng: number;
  dwellTimeSec: number;
}

export interface LevelCrossing {
  id: string;
  name: string;
  locationName: string;
  street: string;
  line: "Riedbahn" | "Nibelungenbahn";
  lat: number;
  lng: number;
  status: "open" | "closing_soon" | "closed" | "unknown";
  crossingType: "road_barrier" | "pedestrian_barrier";
  note: string;
  nextTrainLine?: string;
  nextTrainDestination?: string;
  secondsUntilClosure?: number;
  secondsUntilClearance?: number;
  dailyClosureCountAvg: number;
  avgClosureDurationSec: number;
}

export interface LiveTrain {
  id: string;
  line: string; // e.g. "RE 70", "S 9", "RB 63", "ICE 271"
  trainType: "regional" | "sbahn" | "ice" | "cargo";
  destination: string;
  origin: string;
  corridor: "Riedbahn" | "Nibelungenbahn";
  direction: "north" | "south" | "east" | "west";
  lat: number;
  lng: number;
  speedKmh: number;
  status: "moving" | "stopped";
  currentStationId?: string;
  currentStationName?: string;
  nextStationName?: string;
  dwellTimeRemainingSec?: number;
  dwellTotalSec?: number;
  dwellProgress?: number; // 0.0 to 1.0 for the departure gauge (1.0 = just arrived, 0.0 = leaving now)
  approachingCrossingId?: string;
  approachingCrossingName?: string;
}

// 1. Exact track polylines inside the Ried corridor
export const RIEDBAHN_TRACK: [number, number][] = [[49.738121, 8.493425], [49.737629, 8.493239], [49.737139, 8.493088], [49.736655, 8.492904], [49.73618, 8.492672], [49.734199, 8.49162], [49.733817, 8.491473], [49.732943, 8.490943], [49.732121, 8.490492], [49.730799, 8.489816], [49.730022, 8.489332], [49.728591, 8.488611], [49.727708, 8.488125], [49.727231, 8.487866], [49.726799, 8.487631], [49.726241, 8.487325], [49.72586, 8.487134], [49.72478, 8.486511], [49.724402, 8.486296], [49.723546, 8.485815], [49.723201, 8.485597], [49.722789, 8.485297], [49.722446, 8.485034], [49.722085, 8.484745], [49.721549, 8.484279], [49.720942, 8.483677], [49.720297, 8.483094], [49.719675, 8.482455], [49.7192, 8.481982], [49.718321, 8.481093], [49.717647, 8.480419], [49.716575, 8.479348], [49.716232, 8.479006], [49.715728, 8.478511], [49.714741, 8.477459], [49.714068, 8.476854], [49.713793, 8.476515], [49.71314, 8.475859], [49.712733, 8.475452], [49.711996, 8.474706], [49.711308, 8.474008], [49.710433, 8.473145], [49.708705, 8.471412], [49.707332, 8.470033], [49.705878, 8.468572], [49.705517, 8.468209], [49.70492, 8.467611], [49.704314, 8.467004], [49.703105, 8.465794], [49.701294, 8.46398], [49.700785, 8.463471], [49.70004, 8.462725], [49.699725, 8.46241], [49.698062, 8.460745], [49.697383, 8.460075], [49.696712, 8.459392], [49.695789, 8.458467], [49.695455, 8.458132], [49.695007, 8.457682], [49.694466, 8.457215], [49.694168, 8.456843], [49.693629, 8.456303], [49.692782, 8.455457], [49.692141, 8.4548], [49.691785, 8.454408], [49.691085, 8.453597], [49.690619, 8.452937], [49.689874, 8.451872], [49.689032, 8.450659], [49.688433, 8.449821], [49.687972, 8.44918], [49.687523, 8.44853], [49.687112, 8.447976], [49.686095, 8.446596], [49.685668, 8.446019], [49.685199, 8.445466], [49.684886, 8.445147], [49.684538, 8.444932], [49.684232, 8.44465], [49.683815, 8.444429], [49.683319, 8.444248], [49.682806, 8.444149], [49.682359, 8.444199], [49.681947, 8.444164], [49.681464, 8.444357], [49.680802, 8.44451], [49.680448, 8.444742], [49.679999, 8.444932], [49.678867, 8.445322], [49.67845, 8.445552], [49.677837, 8.445738], [49.67723, 8.446044], [49.676777, 8.446228], [49.675738, 8.446651], [49.674974, 8.446962], [49.674505, 8.447153], [49.673806, 8.447438], [49.673094, 8.447664], [49.672335, 8.44798], [49.671498, 8.448391], [49.670107, 8.448961], [49.669659, 8.449138], [49.668735, 8.44947], [49.668022, 8.449824], [49.667503, 8.449979], [49.666926, 8.450216], [49.666395, 8.45048], [49.665886, 8.450648], [49.664584, 8.451257], [49.663505, 8.451642], [49.6629, 8.451949], [49.662253, 8.452214], [49.661379, 8.452573], [49.660955, 8.452744], [49.660338, 8.452934], [49.659386, 8.453375], [49.658871, 8.453534], [49.658513, 8.453731], [49.657988, 8.453902], [49.657588, 8.454066], [49.65694, 8.454374], [49.656524, 8.454558], [49.656141, 8.454713], [49.655656, 8.454906], [49.654935, 8.455214], [49.654312, 8.455458], [49.653066, 8.455967], [49.652504, 8.456136], [49.651282, 8.45671], [49.650592, 8.456998], [49.649872, 8.45722], [49.648798, 8.457726], [49.648384, 8.457894], [49.647219, 8.45838], [49.646118, 8.458828], [49.645547, 8.459064], [49.643586, 8.459811], [49.642998, 8.46011], [49.642098, 8.460487], [49.641072, 8.460854], [49.640704, 8.461062], [49.639995, 8.461353], [49.639087, 8.461724], [49.638576, 8.461932], [49.636802, 8.462655], [49.635613, 8.463141], [49.635213, 8.463304], [49.634627, 8.463489], [49.633549, 8.463938], [49.632573, 8.464398], [49.632006, 8.464631], [49.631389, 8.464884], [49.630676, 8.465116], [49.630033, 8.465442], [49.628251, 8.466167], [49.62712, 8.466636], [49.626738, 8.466794], [49.62508, 8.467474], [49.624442, 8.46773], [49.623957, 8.467872], [49.623365, 8.468172], [49.622546, 8.468508], [49.620966, 8.469158], [49.619586, 8.469727], [49.619052, 8.469944], [49.617494, 8.470577], [49.61686, 8.470782], [49.616103, 8.471152], [49.615591, 8.47136], [49.614036, 8.472], [49.613239, 8.472328], [49.612629, 8.472578], [49.611353, 8.473046], [49.610636, 8.473397], [49.609955, 8.473676], [49.609284, 8.473952], [49.607509, 8.474676], [49.605893, 8.47534], [49.605023, 8.475642], [49.604639, 8.475861], [49.60418, 8.476052], [49.603549, 8.476248], [49.603033, 8.476546], [49.602365, 8.476849], [49.601816, 8.477105], [49.601167, 8.477473], [49.600417, 8.477652], [49.600027, 8.47804], [49.599625, 8.478111], [49.599068, 8.478469], [49.59768, 8.479049], [49.597303, 8.479204], [49.596852, 8.479377], [49.596181, 8.479622], [49.595522, 8.479857], [49.594532, 8.480223], [49.594041, 8.480228], [49.593713, 8.480526], [49.593261, 8.48064], [49.592874, 8.480758], [49.592235, 8.480979], [49.591679, 8.481159], [49.591038, 8.481348], [49.590411, 8.481502], [49.589875, 8.481539], [49.589295, 8.481661], [49.588834, 8.481682], [49.588416, 8.481692], [49.587942, 8.48166], [49.586146, 8.48168], [49.584723, 8.481707], [49.583545, 8.481718], [49.582598, 8.481733], [49.581738, 8.481744], [49.580832, 8.481759], [49.5791, 8.481798], [49.577675, 8.481875], [49.577028, 8.481885], [49.576169, 8.481896], [49.575601, 8.481847], [49.57369, 8.48188], [49.572697, 8.481948], [49.572031, 8.481959], [49.569941, 8.481937], [49.568753, 8.482007], [49.567461, 8.481976], [49.566386, 8.481999], [49.564939, 8.482011], [49.563901, 8.482021]];

export const NIBELUNGENBAHN_TRACK: [number, number][] = [[49.662026, 8.412635], [49.662324, 8.413092], [49.662537, 8.413479], [49.662765, 8.413972], [49.662936, 8.41438], [49.663144, 8.414935], [49.66332, 8.415522], [49.663483, 8.41616], [49.663614, 8.416814], [49.663694, 8.417391], [49.663756, 8.41806], [49.663783, 8.418784], [49.663781, 8.419203], [49.663742, 8.419912], [49.663669, 8.420607], [49.663571, 8.421205], [49.663475, 8.421666], [49.66334, 8.42218], [49.663212, 8.42262], [49.662973, 8.423276], [49.66276, 8.423761], [49.662514, 8.424245], [49.662266, 8.424671], [49.661865, 8.425246], [49.661165, 8.426113], [49.660798, 8.42656], [49.6605, 8.426923], [49.660098, 8.427411], [49.659732, 8.427856], [49.659406, 8.428253], [49.658905, 8.428868], [49.658509, 8.429353], [49.658232, 8.42968], [49.657384, 8.430714], [49.656923, 8.43127], [49.65644, 8.431859], [49.656104, 8.432268], [49.655806, 8.432633], [49.655194, 8.433376], [49.654884, 8.433754], [49.653587, 8.435328], [49.653016, 8.436021], [49.652288, 8.436904], [49.651797, 8.437502], [49.651495, 8.437869], [49.65059, 8.438972], [49.649627, 8.440141], [49.649254, 8.440631], [49.648976, 8.441032], [49.648683, 8.44149], [49.648457, 8.441882], [49.648145, 8.442464], [49.647874, 8.443032], [49.647619, 8.443623], [49.647427, 8.444119], [49.647261, 8.444594], [49.647103, 8.445086], [49.646955, 8.4456], [49.646808, 8.446172], [49.646619, 8.447047], [49.646533, 8.447549], [49.646433, 8.448238], [49.646369, 8.448742], [49.646301, 8.449482], [49.646275, 8.449949], [49.646238, 8.450602], [49.646174, 8.4518], [49.64613, 8.452513], [49.646084, 8.453017], [49.646038, 8.453434], [49.646042, 8.453959], [49.64597, 8.454481], [49.645978, 8.455104], [49.645943, 8.455654], [49.645855, 8.45641], [49.645805, 8.458045], [49.645742, 8.459081], [49.645604, 8.460505], [49.645578, 8.460964], [49.645484, 8.462528], [49.645404, 8.463891], [49.645392, 8.464399], [49.645387, 8.465104], [49.645357, 8.46563], [49.6453, 8.466581], [49.645271, 8.467025], [49.64522, 8.467936], [49.645181, 8.468699], [49.645147, 8.469331], [49.645132, 8.470179], [49.645146, 8.470823], [49.645186, 8.471569], [49.645263, 8.472381], [49.645631, 8.47635], [49.64601, 8.48044], [49.646142, 8.48185], [49.646233, 8.482818], [49.646331, 8.483866], [49.646526, 8.485926], [49.646906, 8.489985], [49.647154, 8.49257], [49.647323, 8.494446], [49.647467, 8.495936], [49.647534, 8.496638], [49.647887, 8.50042], [49.648195, 8.503671], [49.648365, 8.505508], [49.648554, 8.50751], [49.648841, 8.510563], [49.649171, 8.514077], [49.64949, 8.517425], [49.649599, 8.518741], [49.649788, 8.520636], [49.650128, 8.524282], [49.650177, 8.524713], [49.650215, 8.525141], [49.650332, 8.52629], [49.650418, 8.527347], [49.650776, 8.531151], [49.650879, 8.531981], [49.651046, 8.533024], [49.651506, 8.535105], [49.651894, 8.536686], [49.652159, 8.537704], [49.653233, 8.542116], [49.653385, 8.542767], [49.653595, 8.543636], [49.653737, 8.544205], [49.653833, 8.544633]];

// 2. Stations in the Ried corridor
export const RIED_STATIONS: RailStation[] = [
  {
    id: "biblis",
    name: "Biblis",
    evaNumber: "8000072",
    line: "Riedbahn",
    lat: 49.6886,
    lng: 8.4485,
    dwellTimeSec: 60,
  },
  {
    id: "bobstadt",
    name: "Bobstadt",
    evaNumber: "8001034",
    line: "Riedbahn",
    lat: 49.6631,
    lng: 8.4468,
    dwellTimeSec: 45,
  },
  {
    id: "buerstadt-oben",
    name: "Bürstadt (Oben - Riedbahn)",
    evaNumber: "8000143",
    line: "Riedbahn",
    lat: 49.6458,
    lng: 8.4563,
    dwellTimeSec: 60,
  },
  {
    id: "lampertheim",
    name: "Lampertheim",
    evaNumber: "8003666",
    line: "Riedbahn",
    lat: 49.5980,
    lng: 8.4760,
    dwellTimeSec: 60,
  },
  {
    id: "hofheim",
    name: "Hofheim (Ried)",
    evaNumber: "8002900",
    line: "Nibelungenbahn",
    lat: 49.6588,
    lng: 8.4115,
    dwellTimeSec: 45,
  },
  {
    id: "buerstadt-unten",
    name: "Bürstadt (Unten - Nibelungenbahn)",
    evaNumber: "8000143",
    line: "Nibelungenbahn",
    lat: 49.6456,
    lng: 8.4564,
    dwellTimeSec: 60,
  },
];

// 3. The 4 ACTIVE Bahnübergänge in the Ried (strictly excluding removed/closed ones)
export const ACTIVE_LEVEL_CROSSINGS: LevelCrossing[] = [
  {
    id: "bu-buerstadt-mainstr",
    name: "BÜ Mainstraße",
    locationName: "Bürstadt Mainstraße",
    street: "Mainstraße",
    line: "Nibelungenbahn",
    lat: 49.64600,
    lng: 8.45398,
    status: "open",
    crossingType: "road_barrier",
    note: "Modernisierte RBÜT Halbschranken mit Lichtzeichen (km 9.8)",
    dailyClosureCountAvg: 48,
    avgClosureDurationSec: 135,
  },
  {
    id: "bu-buerstadt-waldgarten",
    name: "BÜ Waldgartenstraße",
    locationName: "Bürstadt Waldgarten-/Industriestr.",
    street: "Waldgartenstraße / Industriestraße",
    line: "Nibelungenbahn",
    lat: 49.64574,
    lng: 8.45819,
    status: "open",
    crossingType: "pedestrian_barrier",
    note: "Vollbeschrankter Fußgänger-/Reisendenüberweg (km 10.18)",
    dailyClosureCountAvg: 48,
    avgClosureDurationSec: 110,
  },
  {
    id: "bu-biblis-kirchstr",
    name: "BÜ Kirchstraße",
    locationName: "Biblis Kirchstraße (Gemeindesee)",
    street: "Kirchstraße",
    line: "Riedbahn",
    lat: 49.68207,
    lng: 8.44415,
    status: "open",
    crossingType: "road_barrier",
    note: "Modernisierte Halbschrankenanlage mit Radar-/Kameraüberwachung (km 27.2)",
    dailyClosureCountAvg: 72,
    avgClosureDurationSec: 155,
  },
  {
    id: "bu-hofheim-bibliser-weg",
    name: "BÜ Bibliser Weg",
    locationName: "Hofheim (Ried) Bibliser Weg",
    street: "Bibliser Weg / L3411",
    line: "Nibelungenbahn",
    lat: 49.66258,
    lng: 8.41341,
    status: "open",
    crossingType: "road_barrier",
    note: "Modernisiert 2019 mit RBÜT Halbschranken + Lichtzeichen (km 6.09)",
    dailyClosureCountAvg: 36,
    avgClosureDurationSec: 120,
  },
];

// Helper: Distance in meters between two lat/lng pairs
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Helper: Interpolate along a polyline by progress (0.0 to 1.0)
export function interpolatePolyline(
  points: [number, number][],
  progress: number
): { lat: number; lng: number; heading: number } {
  if (points.length === 0) return { lat: 0, lng: 0, heading: 0 };
  if (points.length === 1 || progress <= 0) {
    return { lat: points[0][0], lng: points[0][1], heading: 0 };
  }
  if (progress >= 1) {
    const last = points[points.length - 1];
    const prev = points[points.length - 2];
    const heading = (Math.atan2(last[1] - prev[1], last[0] - prev[0]) * 180) / Math.PI;
    return { lat: last[0], lng: last[1], heading };
  }

  // Calculate cumulative distances
  const dists: number[] = [0];
  let totalDist = 0;
  for (let i = 1; i < points.length; i++) {
    const d = haversineMeters(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]);
    totalDist += d;
    dists.push(totalDist);
  }

  const targetDist = progress * totalDist;
  for (let i = 1; i < points.length; i++) {
    if (dists[i] >= targetDist) {
      const segDist = dists[i] - dists[i - 1];
      const segProg = segDist > 0 ? (targetDist - dists[i - 1]) / segDist : 0;
      const p1 = points[i - 1];
      const p2 = points[i];
      const lat = p1[0] + (p2[0] - p1[0]) * segProg;
      const lng = p1[1] + (p2[1] - p1[1]) * segProg;
      const heading = (Math.atan2(p2[1] - p1[1], p2[0] - p1[0]) * 180) / Math.PI;
      return { lat, lng, heading };
    }
  }

  const last = points[points.length - 1];
  return { lat: last[0], lng: last[1], heading: 0 };
}

/**
 * High-precision simulation and real-time state calculator for Ried mobility.
 * Generates active trains adhering to actual Riedbahn (RE70, S9) and Nibelungenbahn (RB63)
 * schedules, animating their transit through the corridor and updating Bahnübergang barrier states.
 */
export function calculateRiedMobility(timestampMs: number = Date.now()): {
  trains: LiveTrain[];
  crossings: LevelCrossing[];
} {
  const trains: LiveTrain[] = [];
  const crossings = ACTIVE_LEVEL_CROSSINGS.map((c) => ({ ...c }));

  // Define regular train services traversing the Ried corridor
  // Each service has a period (e.g. 15 or 30 min), duration, stations with dwell times
  const services = [
    // 1. RE 70: Frankfurt <-> Mannheim (Riedbahn) - Fast regional express
    {
      idPrefix: "re70-south",
      line: "RE 70",
      type: "regional" as const,
      origin: "Frankfurt (Main) Hbf",
      destination: "Mannheim Hbf",
      corridor: "Riedbahn" as const,
      direction: "south" as const,
      periodSec: 1800, // Every 30 min
      offsetSec: 240,
      speedKmh: 120,
      track: RIEDBAHN_TRACK,
      reverseTrack: false,
      stops: [
        { stationId: "biblis", stopProg: 0.28, dwellSec: 60 },
        { stationId: "buerstadt-oben", stopProg: 0.52, dwellSec: 60 },
        { stationId: "lampertheim", stopProg: 0.81, dwellSec: 60 },
      ],
      totalTransitSec: 660, // 11 minutes across the Ried corridor
    },
    {
      idPrefix: "re70-north",
      line: "RE 70",
      type: "regional" as const,
      origin: "Mannheim Hbf",
      destination: "Frankfurt (Main) Hbf",
      corridor: "Riedbahn" as const,
      direction: "north" as const,
      periodSec: 1800,
      offsetSec: 1140,
      speedKmh: 120,
      track: [...RIEDBAHN_TRACK].reverse(),
      reverseTrack: true,
      stops: [
        { stationId: "lampertheim", stopProg: 0.19, dwellSec: 60 },
        { stationId: "buerstadt-oben", stopProg: 0.48, dwellSec: 60 },
        { stationId: "biblis", stopProg: 0.72, dwellSec: 60 },
      ],
      totalTransitSec: 660,
    },

    // 2. S 9: Groß-Rohrheim / Biblis <-> Mannheim (Riedbahn) - S-Bahn
    {
      idPrefix: "s9-south",
      line: "S 9",
      type: "sbahn" as const,
      origin: "Groß-Rohrheim",
      destination: "Mannheim Hbf",
      corridor: "Riedbahn" as const,
      direction: "south" as const,
      periodSec: 1800,
      offsetSec: 720,
      speedKmh: 95,
      track: RIEDBAHN_TRACK,
      reverseTrack: false,
      stops: [
        { stationId: "biblis", stopProg: 0.28, dwellSec: 50 },
        { stationId: "bobstadt", stopProg: 0.42, dwellSec: 40 },
        { stationId: "buerstadt-oben", stopProg: 0.52, dwellSec: 50 },
        { stationId: "lampertheim", stopProg: 0.81, dwellSec: 50 },
      ],
      totalTransitSec: 820,
    },
    {
      idPrefix: "s9-north",
      line: "S 9",
      type: "sbahn" as const,
      origin: "Mannheim Hbf",
      destination: "Groß-Rohrheim",
      corridor: "Riedbahn" as const,
      direction: "north" as const,
      periodSec: 1800,
      offsetSec: 1620,
      speedKmh: 95,
      track: [...RIEDBAHN_TRACK].reverse(),
      reverseTrack: true,
      stops: [
        { stationId: "lampertheim", stopProg: 0.19, dwellSec: 50 },
        { stationId: "buerstadt-oben", stopProg: 0.48, dwellSec: 50 },
        { stationId: "bobstadt", stopProg: 0.58, dwellSec: 40 },
        { stationId: "biblis", stopProg: 0.72, dwellSec: 50 },
      ],
      totalTransitSec: 820,
    },

    // 3. RB 63: Worms <-> Bürstadt <-> Bensheim (Nibelungenbahn)
    {
      idPrefix: "rb63-east",
      line: "RB 63",
      type: "regional" as const,
      origin: "Worms Hbf",
      destination: "Bensheim",
      corridor: "Nibelungenbahn" as const,
      direction: "east" as const,
      periodSec: 1800,
      offsetSec: 480,
      speedKmh: 80,
      track: NIBELUNGENBAHN_TRACK,
      reverseTrack: false,
      stops: [
        { stationId: "hofheim", stopProg: 0.12, dwellSec: 45 },
        { stationId: "buerstadt-unten", stopProg: 0.56, dwellSec: 60 },
      ],
      totalTransitSec: 720,
    },
    {
      idPrefix: "rb63-west",
      line: "RB 63",
      type: "regional" as const,
      origin: "Bensheim",
      destination: "Worms Hbf",
      corridor: "Nibelungenbahn" as const,
      direction: "west" as const,
      periodSec: 1800,
      offsetSec: 1380,
      speedKmh: 80,
      track: [...NIBELUNGENBAHN_TRACK].reverse(),
      reverseTrack: true,
      stops: [
        { stationId: "buerstadt-unten", stopProg: 0.44, dwellSec: 60 },
        { stationId: "hofheim", stopProg: 0.88, dwellSec: 45 },
      ],
      totalTransitSec: 720,
    },

    // 4. Long-Distance High-Speed Trains (Fernverkehr: ICE / TGV / IC / EC)
    // Non-stopping express transits on the Riedbahn corridor
    {
      idPrefix: "ice271-south",
      line: "ICE 271",
      type: "ice" as const,
      origin: "Frankfurt (Main) Hbf",
      destination: "Basel SBB",
      corridor: "Riedbahn" as const,
      direction: "south" as const,
      periodSec: 3600,
      offsetSec: 480,
      speedKmh: 180,
      track: RIEDBAHN_TRACK,
      reverseTrack: false,
      stops: [] as { stationId: string; stopProg: number; dwellSec: number }[],
      totalTransitSec: 420,
    },
    {
      idPrefix: "ice593-south",
      line: "ICE 593",
      type: "ice" as const,
      origin: "Hamburg-Altona",
      destination: "München Hbf",
      corridor: "Riedbahn" as const,
      direction: "south" as const,
      periodSec: 3600,
      offsetSec: 1080,
      speedKmh: 180,
      track: RIEDBAHN_TRACK,
      reverseTrack: false,
      stops: [] as { stationId: string; stopProg: number; dwellSec: number }[],
      totalTransitSec: 420,
    },
    {
      idPrefix: "ice611-south",
      line: "ICE 611",
      type: "ice" as const,
      origin: "Dortmund Hbf",
      destination: "Stuttgart Hbf",
      corridor: "Riedbahn" as const,
      direction: "south" as const,
      periodSec: 3600,
      offsetSec: 1680,
      speedKmh: 180,
      track: RIEDBAHN_TRACK,
      reverseTrack: false,
      stops: [] as { stationId: string; stopProg: number; dwellSec: number }[],
      totalTransitSec: 420,
    },
    {
      idPrefix: "tgv9556-south",
      line: "TGV 9556",
      type: "ice" as const,
      origin: "Frankfurt (Main) Hbf",
      destination: "Paris Est",
      corridor: "Riedbahn" as const,
      direction: "south" as const,
      periodSec: 3600,
      offsetSec: 2280,
      speedKmh: 180,
      track: RIEDBAHN_TRACK,
      reverseTrack: false,
      stops: [] as { stationId: string; stopProg: number; dwellSec: number }[],
      totalTransitSec: 420,
    },
    {
      idPrefix: "ic2013-south",
      line: "IC 2013",
      type: "ice" as const,
      origin: "Dortmund Hbf",
      destination: "Oberstdorf / Innsbruck",
      corridor: "Riedbahn" as const,
      direction: "south" as const,
      periodSec: 3600,
      offsetSec: 2880,
      speedKmh: 160,
      track: RIEDBAHN_TRACK,
      reverseTrack: false,
      stops: [] as { stationId: string; stopProg: number; dwellSec: number }[],
      totalTransitSec: 450,
    },

    // Northbound long-distance express
    {
      idPrefix: "ice372-north",
      line: "ICE 372",
      type: "ice" as const,
      origin: "Interlaken Ost / Basel",
      destination: "Berlin Hbf",
      corridor: "Riedbahn" as const,
      direction: "north" as const,
      periodSec: 3600,
      offsetSec: 180,
      speedKmh: 180,
      track: [...RIEDBAHN_TRACK].reverse(),
      reverseTrack: true,
      stops: [] as { stationId: string; stopProg: number; dwellSec: number }[],
      totalTransitSec: 420,
    },
    {
      idPrefix: "ice792-north",
      line: "ICE 792",
      type: "ice" as const,
      origin: "München Hbf",
      destination: "Hamburg-Altona",
      corridor: "Riedbahn" as const,
      direction: "north" as const,
      periodSec: 3600,
      offsetSec: 780,
      speedKmh: 180,
      track: [...RIEDBAHN_TRACK].reverse(),
      reverseTrack: true,
      stops: [] as { stationId: string; stopProg: number; dwellSec: number }[],
      totalTransitSec: 420,
    },
    {
      idPrefix: "ice512-north",
      line: "ICE 512",
      type: "ice" as const,
      origin: "Stuttgart Hbf",
      destination: "Dortmund Hbf",
      corridor: "Riedbahn" as const,
      direction: "north" as const,
      periodSec: 3600,
      offsetSec: 1380,
      speedKmh: 180,
      track: [...RIEDBAHN_TRACK].reverse(),
      reverseTrack: true,
      stops: [] as { stationId: string; stopProg: number; dwellSec: number }[],
      totalTransitSec: 420,
    },
    {
      idPrefix: "tgv9555-north",
      line: "TGV 9555",
      type: "ice" as const,
      origin: "Paris Est",
      destination: "Frankfurt (Main) Hbf",
      corridor: "Riedbahn" as const,
      direction: "north" as const,
      periodSec: 3600,
      offsetSec: 1980,
      speedKmh: 180,
      track: [...RIEDBAHN_TRACK].reverse(),
      reverseTrack: true,
      stops: [] as { stationId: string; stopProg: number; dwellSec: number }[],
      totalTransitSec: 420,
    },
    {
      idPrefix: "ec8-north",
      line: "EC 8",
      type: "ice" as const,
      origin: "Zürich HB",
      destination: "Hamburg-Altona",
      corridor: "Riedbahn" as const,
      direction: "north" as const,
      periodSec: 3600,
      offsetSec: 2580,
      speedKmh: 160,
      track: [...RIEDBAHN_TRACK].reverse(),
      reverseTrack: true,
      stops: [] as { stationId: string; stopProg: number; dwellSec: number }[],
      totalTransitSec: 450,
    },

    // 5. Heavy Freight Trains (Güterverkehr / Cargo)
    // Southbound Riedbahn freight arterial
    {
      idPrefix: "cargo48721-south",
      line: "DB Cargo 48721",
      type: "cargo" as const,
      origin: "Köln Eifeltor",
      destination: "Mannheim Rbf",
      corridor: "Riedbahn" as const,
      direction: "south" as const,
      periodSec: 3600,
      offsetSec: 1380,
      speedKmh: 100,
      track: RIEDBAHN_TRACK,
      reverseTrack: false,
      stops: [] as { stationId: string; stopProg: number; dwellSec: number }[],
      totalTransitSec: 750,
    },
    {
      idPrefix: "txlog40183-south",
      line: "TX Logistik 40183",
      type: "cargo" as const,
      origin: "Lübeck Skandinavienkai",
      destination: "Verona Quadrante Europa",
      corridor: "Riedbahn" as const,
      direction: "south" as const,
      periodSec: 3600,
      offsetSec: 3180,
      speedKmh: 100,
      track: RIEDBAHN_TRACK,
      reverseTrack: false,
      stops: [] as { stationId: string; stopProg: number; dwellSec: number }[],
      totalTransitSec: 750,
    },

    // Northbound Riedbahn freight arterial
    {
      idPrefix: "cargo51342-north",
      line: "DB Cargo 51342",
      type: "cargo" as const,
      origin: "Mannheim Rbf",
      destination: "Frankfurt (Main) Ost",
      corridor: "Riedbahn" as const,
      direction: "north" as const,
      periodSec: 3600,
      offsetSec: 480,
      speedKmh: 100,
      track: [...RIEDBAHN_TRACK].reverse(),
      reverseTrack: true,
      stops: [] as { stationId: string; stopProg: number; dwellSec: number }[],
      totalTransitSec: 750,
    },
    {
      idPrefix: "sbb43105-north",
      line: "SBB Cargo Int 43105",
      type: "cargo" as const,
      origin: "Basel Kleinhüningen",
      destination: "Rotterdam Kijfhoek",
      corridor: "Riedbahn" as const,
      direction: "north" as const,
      periodSec: 3600,
      offsetSec: 2280,
      speedKmh: 100,
      track: [...RIEDBAHN_TRACK].reverse(),
      reverseTrack: true,
      stops: [] as { stationId: string; stopProg: number; dwellSec: number }[],
      totalTransitSec: 750,
    },

    // 6. Nibelungenbahn Freight & Transfer Runs (non-stopping through Hofheim & Bürstadt)
    {
      idPrefix: "nib-cargo-east",
      line: "DB Cargo 54890",
      type: "cargo" as const,
      origin: "Worms Gbf",
      destination: "Bensheim",
      corridor: "Nibelungenbahn" as const,
      direction: "east" as const,
      periodSec: 3600,
      offsetSec: 900,
      speedKmh: 70,
      track: NIBELUNGENBAHN_TRACK,
      reverseTrack: false,
      stops: [] as { stationId: string; stopProg: number; dwellSec: number }[],
      totalTransitSec: 820,
    },
    {
      idPrefix: "nib-cargo-west",
      line: "DB Cargo 54891",
      type: "cargo" as const,
      origin: "Bensheim",
      destination: "Worms Gbf",
      corridor: "Nibelungenbahn" as const,
      direction: "west" as const,
      periodSec: 3600,
      offsetSec: 2700,
      speedKmh: 70,
      track: [...NIBELUNGENBAHN_TRACK].reverse(),
      reverseTrack: true,
      stops: [] as { stationId: string; stopProg: number; dwellSec: number }[],
      totalTransitSec: 820,
    },
  ];

  const nowSec = timestampMs / 1000;

  for (const s of services) {
    // Determine active slot
    const cycleTime = (nowSec - s.offsetSec) % s.periodSec;
    const elapsedSec = (cycleTime + s.periodSec) % s.periodSec;

    // Train is only inside the Ried corridor during totalTransitSec!
    // Outside this time it has not entered or has already left.
    if (elapsedSec > s.totalTransitSec) {
      continue;
    }

    // Cycle index for unique stable ID
    const cycleIndex = Math.floor((nowSec - s.offsetSec) / s.periodSec);
    const trainId = `${s.idPrefix}-${cycleIndex}`;

    // Compute progress along corridor taking stops and dwell times into account
    // Total motion time = totalTransitSec - sum(dwellSec)
    const totalDwell = s.stops.reduce((acc, st) => acc + st.dwellSec, 0);
    const totalMotionSec = Math.max(1, s.totalTransitSec - totalDwell);

    // Find if train is currently dwelling at a station
    let isStopped = false;
    let currentStation: RailStation | undefined;
    let dwellRemaining = 0;
    let dwellTotal = 0;
    let dwellProg = 0;
    let motionProgress = 0;

    // Timeline calculation
    let cursorTime = 0;
    let prevProg = 0;

    for (let i = 0; i < s.stops.length; i++) {
      const stop = s.stops[i];
      const station = RIED_STATIONS.find((st) => st.id === stop.stationId);
      const legProgDelta = stop.stopProg - prevProg;
      const legMotionSec = (legProgDelta * totalMotionSec);

      const legEndTime = cursorTime + legMotionSec;
      const dwellEndTime = legEndTime + stop.dwellSec;

      if (elapsedSec < legEndTime) {
        // In motion towards this stop
        const legElapsed = elapsedSec - cursorTime;
        const subProg = legMotionSec > 0 ? legElapsed / legMotionSec : 0;
        motionProgress = prevProg + subProg * legProgDelta;
        break;
      } else if (elapsedSec >= legEndTime && elapsedSec <= dwellEndTime) {
        // Train is stopped at this station!
        isStopped = true;
        currentStation = station;
        motionProgress = stop.stopProg;
        dwellTotal = stop.dwellSec;
        dwellRemaining = Math.max(0, Math.round(dwellEndTime - elapsedSec));
        // Progress for gauge: 1.0 (just arrived) -> 0.0 (departing)
        dwellProg = Math.max(0, Math.min(1, dwellRemaining / dwellTotal));
        break;
      } else {
        cursorTime = dwellEndTime;
        prevProg = stop.stopProg;
      }
    }

    if (!isStopped && elapsedSec > cursorTime) {
      // After last stop to end of corridor
      const remainingMotionSec = s.totalTransitSec - cursorTime;
      const legElapsed = elapsedSec - cursorTime;
      const subProg = remainingMotionSec > 0 ? legElapsed / remainingMotionSec : 1;
      motionProgress = prevProg + subProg * (1 - prevProg);
    }

    // Clamp progress
    motionProgress = Math.max(0, Math.min(1, motionProgress));

    // Interpolate coordinate along track
    const pos = interpolatePolyline(s.track, motionProgress);

    const liveTrain: LiveTrain = {
      id: trainId,
      line: s.line,
      trainType: s.type,
      origin: s.origin,
      destination: s.destination,
      corridor: s.corridor,
      direction: s.direction,
      lat: Number(pos.lat.toFixed(6)),
      lng: Number(pos.lng.toFixed(6)),
      speedKmh: isStopped ? 0 : s.speedKmh,
      status: isStopped ? "stopped" : "moving",
      currentStationId: currentStation?.id,
      currentStationName: currentStation?.name,
      dwellTimeRemainingSec: isStopped ? dwellRemaining : undefined,
      dwellTotalSec: isStopped ? dwellTotal : undefined,
      dwellProgress: isStopped ? dwellProg : undefined,
    };

    trains.push(liveTrain);

    // Check proximity to crossings on the same corridor
    for (const crossing of crossings) {
      if (crossing.line !== s.corridor) continue;

      const dist = haversineMeters(liveTrain.lat, liveTrain.lng, crossing.lat, crossing.lng);

      // Estimate seconds until reaching crossing based on speed
      const speedMs = Math.max(10, (s.speedKmh * 1000) / 3600);
      const estSecToCrossing = Math.round(dist / speedMs);

      // Check if train is approaching or currently traversing the crossing:
      // Crossing is CLOSED if train is within closeDist (approx 5-15s before and during passage)
      // Crossing is CLOSING_SOON if train is within warningDist (~30s to 60s away)
      const warningDist = Math.max(950, speedMs * 30);
      const closeDist = Math.max(160, speedMs * 4);

      if (dist <= closeDist) {
        crossing.status = "closed";
        crossing.nextTrainLine = s.line;
        crossing.nextTrainDestination = s.destination;
        crossing.secondsUntilClosure = 0;
        crossing.secondsUntilClearance = Math.max(15, Math.round(dist / speedMs) + 15);
        liveTrain.approachingCrossingId = crossing.id;
        liveTrain.approachingCrossingName = crossing.name;
      } else if (dist <= warningDist && crossing.status !== "closed") {
        if (crossing.status !== "closing_soon" || estSecToCrossing < (crossing.secondsUntilClosure ?? Infinity)) {
          crossing.status = "closing_soon";
          crossing.nextTrainLine = s.line;
          crossing.nextTrainDestination = s.destination;
          crossing.secondsUntilClosure = estSecToCrossing;
          crossing.secondsUntilClearance = estSecToCrossing + 30;
        }
        liveTrain.approachingCrossingId = crossing.id;
        liveTrain.approachingCrossingName = crossing.name;
      }
    }
  }

  return { trains, crossings };
}
