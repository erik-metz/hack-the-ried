import L from "leaflet";

export interface TemperaturePoint {
  lat: number;
  lng: number;
  temp: number;
}

interface ColorStop {
  temp: number;
  r: number;
  g: number;
  b: number;
}

const COLOR_STOPS: ColorStop[] = [
  { temp: -5, r: 99, g: 102, b: 241 },   // #6366f1 indigo
  { temp: 0, r: 56, g: 189, b: 248 },    // #38bdf8 light sky
  { temp: 10, r: 45, g: 212, b: 191 },   // #2dd4bf teal
  { temp: 20, r: 251, g: 191, b: 36 },   // #fbbf24 amber
  { temp: 30, r: 251, g: 113, b: 133 },  // #fb7185 rose/coral
  { temp: 38, r: 225, g: 29, b: 72 },    // #e11d48 crimson
];

export function getTemperatureRgb(temp: number): [number, number, number] {
  if (temp <= COLOR_STOPS[0].temp) {
    return [COLOR_STOPS[0].r, COLOR_STOPS[0].g, COLOR_STOPS[0].b];
  }
  const last = COLOR_STOPS[COLOR_STOPS.length - 1];
  if (temp >= last.temp) {
    return [last.r, last.g, last.b];
  }
  for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
    const s0 = COLOR_STOPS[i];
    const s1 = COLOR_STOPS[i + 1];
    if (temp >= s0.temp && temp <= s1.temp) {
      const ratio = (temp - s0.temp) / (s1.temp - s0.temp);
      return [
        Math.round(s0.r + (s1.r - s0.r) * ratio),
        Math.round(s0.g + (s1.g - s0.g) * ratio),
        Math.round(s0.b + (s1.b - s0.b) * ratio),
      ];
    }
  }
  return [last.r, last.g, last.b];
}

export class TemperatureHeatmapLayer extends L.Layer {
  private _canvas: HTMLCanvasElement | null = null;
  private _offscreenCanvas: HTMLCanvasElement | null = null;
  private _points: TemperaturePoint[] = [];
  private _leafletMap: L.Map | null = null;
  private _maxInfluenceKm = 14;

  constructor(points: TemperaturePoint[] = [], maxInfluenceKm = 14) {
    super();
    this._points = points;
    this._maxInfluenceKm = maxInfluenceKm;
  }

  setPoints(points: TemperaturePoint[]) {
    this._points = points;
    this.redraw();
  }

  onAdd(map: L.Map): this {
    this._leafletMap = map;
    if (!this._canvas) {
      this._canvas = L.DomUtil.create("canvas", "leaflet-temperature-heatmap");
      this._canvas.style.position = "absolute";
      this._canvas.style.pointerEvents = "none";
      this._canvas.style.zIndex = "250"; // under markers, above tiles
    }
    const pane = map.getPane("overlayPane");
    if (pane && this._canvas) {
      pane.appendChild(this._canvas);
    }
    map.on("moveend zoomend resize", this.redraw, this);
    this.redraw();
    return this;
  }

  onRemove(map: L.Map): this {
    if (this._canvas && this._canvas.parentNode) {
      this._canvas.parentNode.removeChild(this._canvas);
    }
    map.off("moveend zoomend resize", this.redraw, this);
    this._leafletMap = null;
    return this;
  }

  redraw() {
    if (!this._leafletMap || !this._canvas || this._points.length === 0) {
      if (this._canvas) {
        const ctx = this._canvas.getContext("2d");
        ctx?.clearRect(0, 0, this._canvas.width, this._canvas.height);
      }
      return;
    }

    const map = this._leafletMap;

    const bounds = map.getBounds();
    const northWest = bounds.getNorthWest();
    const southEast = bounds.getSouthEast();

    const topLeft = map.latLngToLayerPoint(northWest);
    const bottomRight = map.latLngToLayerPoint(southEast);
    const width = Math.max(1, Math.round(bottomRight.x - topLeft.x));
    const height = Math.max(1, Math.round(bottomRight.y - topLeft.y));

    L.DomUtil.setPosition(this._canvas, topLeft);
    this._canvas.width = width;
    this._canvas.height = height;

    // Use a downscaled raster grid for 60fps performance and smooth bilinear upscaling
    const gridStep = 6;
    const gridW = Math.max(2, Math.ceil(width / gridStep));
    const gridH = Math.max(2, Math.ceil(height / gridStep));

    if (!this._offscreenCanvas) {
      this._offscreenCanvas = document.createElement("canvas");
    }
    this._offscreenCanvas.width = gridW;
    this._offscreenCanvas.height = gridH;

    const offCtx = this._offscreenCanvas.getContext("2d", { willReadFrequently: true });
    if (!offCtx) return;

    const imgData = offCtx.createImageData(gridW, gridH);
    const data = imgData.data;

    // Precalculate lat/lng coordinates for the grid rows and columns
    const lngs = new Float64Array(gridW);
    const lats = new Float64Array(gridH);
    for (let x = 0; x < gridW; x++) {
      lngs[x] = map.layerPointToLatLng(L.point(topLeft.x + x * gridStep, topLeft.y)).lng;
    }
    for (let y = 0; y < gridH; y++) {
      lats[y] = map.layerPointToLatLng(L.point(topLeft.x, topLeft.y + y * gridStep)).lat;
    }

    const points = this._points;
    const numPoints = points.length;
    const maxRadius = this._maxInfluenceKm;

    for (let y = 0; y < gridH; y++) {
      const lat = lats[y];
      const cosLat = Math.cos((lat * Math.PI) / 180);
      const rowOffset = y * gridW * 4;

      for (let x = 0; x < gridW; x++) {
        const lng = lngs[x];

        let sumWeight = 0;
        let sumWeightedTemp = 0;
        let minDist = 99999;

        for (let i = 0; i < numPoints; i++) {
          const p = points[i];
          const dLat = (lat - p.lat) * 111.0;
          const dLng = (lng - p.lng) * (111.0 * cosLat);
          const dist = Math.hypot(dLat, dLng);

          if (dist < minDist) minDist = dist;

          if (dist < 0.05) {
            // Immediate proximity to a station
            sumWeightedTemp = p.temp;
            sumWeight = 1;
            minDist = 0;
            break;
          }

          if (dist <= maxRadius) {
            // Shepard's modified inverse-distance weighting
            const weight = Math.pow((maxRadius - dist) / (maxRadius * dist), 2);
            sumWeight += weight;
            sumWeightedTemp += weight * p.temp;
          }
        }

        const pixelIndex = rowOffset + x * 4;

        if (sumWeight <= 0 || minDist >= maxRadius) {
          data[pixelIndex + 3] = 0; // fully transparent outside sensor coverage
          continue;
        }

        const interpolatedTemp = sumWeightedTemp / sumWeight;
        const [r, g, b] = getTemperatureRgb(interpolatedTemp);

        // Smooth cubic opacity falloff near outer boundary
        let alphaFactor = Math.max(0, 1 - minDist / maxRadius);
        alphaFactor = alphaFactor * alphaFactor * (3 - 2 * alphaFactor);
        const alpha = Math.round(130 * alphaFactor); // max alpha ~0.51 to preserve map readability

        data[pixelIndex] = r;
        data[pixelIndex + 1] = g;
        data[pixelIndex + 2] = b;
        data[pixelIndex + 3] = alpha;
      }
    }

    offCtx.putImageData(imgData, 0, 0);

    const mainCtx = this._canvas.getContext("2d");
    if (!mainCtx) return;
    mainCtx.clearRect(0, 0, width, height);
    mainCtx.imageSmoothingEnabled = true;
    mainCtx.drawImage(this._offscreenCanvas, 0, 0, width, height);
  }
}
