import { CONTEXT_LAYERS, CONTEXT_REGION, contextQuery, decodeContextPage, isContextLayerId, type ContextFeature } from "@/lib/contextLayers";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("layer") ?? "";
  if (!isContextLayerId(id)) return Response.json({ error: "Unbekannte Kartenebene" }, { status: 400 });
  const config = CONTEXT_LAYERS[id];
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(40_000)]);
  try {
    const collections = await Promise.all(config.sublayers.map(async sublayer => {
      const features: ContextFeature[] = [];
      const seen = new Set<string | number>();
      // Bounded regional query; stable object-ID ordering and explicit overflow failure.
      for (let offset = 0; offset < 10_000; offset += 1000) {
        const response = await fetch(contextQuery(id, sublayer, offset), { signal, next: { revalidate: 86400 } });
        if (!response.ok) throw new Error("Source unavailable");
        const raw = await response.json();
        const page = decodeContextPage(raw);
        for (const feature of page.features) {
          const objectId = feature.properties?.[config.objectId];
          if ((typeof objectId !== "number" && typeof objectId !== "string") || seen.has(objectId)) throw new Error("Missing or duplicate object ID");
          seen.add(objectId);
          features.push({ ...feature, properties: { ...feature.properties, scenario: sublayer } });
        }
        if (!raw.exceededTransferLimit && !raw.properties?.exceededTransferLimit && page.features.length < 1000) return features;
      }
      throw new Error("Regional data exceeds limit");
    }));
    return Response.json({ type: "FeatureCollection", features: collections.flat(), region: CONTEXT_REGION }, {
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
    });
  } catch {
    // Never publish a partial layer as complete or substitute illustrative geometry.
    return Response.json({ error: "Quelldaten derzeit nicht vollständig verfügbar. Bitte erneut versuchen." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
