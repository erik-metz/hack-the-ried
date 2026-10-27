import { CONTEXT_REGION, type ContextFeature } from "@/lib/contextLayers";
import { SUPPLEMENTARY_SOURCES, isSupplementaryId, supplementaryLayerUrl, supplementaryQuery, decodeSupplementaryPage, warningSourceTimestamp, retainedWarning } from "@/lib/supplementaryLayers";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("layer") ?? "";
  if (!isSupplementaryId(id)) return Response.json({ error: "Unbekannte Datenquelle" }, { status: 400 });
  const config = SUPPLEMENTARY_SOURCES[id];
  const live = id === "warnings";
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(40_000)]);
  const fetchOptions = live ? { signal, cache: "no-store" as const } : { signal, next: { revalidate: 86400 } };
  try {
    const collections = await Promise.all(config.layers.map(async layer => {
      let sourceUpdatedAt: number | null = null;
      if (live) {
        const metadata = await fetch(`${supplementaryLayerUrl(id, layer.id)}?f=json`, fetchOptions);
        if (!metadata.ok) throw new Error("Source unavailable");
        sourceUpdatedAt = warningSourceTimestamp(await metadata.json(), Date.now());
      }
      const features: ContextFeature[] = [];
      const seen = new Set<string | number>();
      for (let offset = 0; offset < 10000; offset += 1000) {
        const response = await fetch(supplementaryQuery(id, layer.id, offset), fetchOptions);
        if (!response.ok) throw new Error("Source unavailable");
        const raw = await response.json();
        const page = decodeSupplementaryPage(id, raw);
        for (const feature of page.features) {
          const objectId = feature.properties?.[layer.objectId];
          if ((typeof objectId !== "number" && typeof objectId !== "string") || seen.has(objectId)) throw new Error("Missing or duplicate object ID");
          seen.add(objectId);
          features.push({ ...feature, properties: { ...feature.properties, source_layer: layer.id, source_category: layer.name } });
        }
        const more = raw.exceededTransferLimit || raw.properties?.exceededTransferLimit;
        if (more && !page.features.length) throw new Error("Empty truncated page");
        if (!more && page.features.length < 1000) return { features, sourceUpdatedAt };
      }
      throw new Error("Result limit exceeded");
    }));
    const now = Date.now();
    // Recheck after all requests: slow acquisition must not turn stale metadata into a fresh empty result.
    if (live) for (const c of collections) warningSourceTimestamp({ editingInfo: { dataLastEditDate: c.sourceUpdatedAt } }, now);
    const allFeatures = collections.flatMap(c => c.features);
    const features = live ? allFeatures.filter(f => retainedWarning(f.properties, now)) : allFeatures;
    const body = { type: "FeatureCollection", features, region: CONTEXT_REGION,
      source: { id, item: config.item, attribution: config.attribution, license: config.license, data_stand: config.dataStand, note: config.note },
      ...(live ? { checked_at: new Date(now).toISOString(), source_updated_at: new Date(collections[0].sourceUpdatedAt!).toISOString(), source_feature_count: allFeatures.length } : {}),
    };
    const encoded = JSON.stringify(body);
    if (new TextEncoder().encode(encoded).length > 4_000_000) throw new Error("Response too large");
    return new Response(encoded, { headers: { "Content-Type": "application/json", "Cache-Control": live ? "no-store" : "public, max-age=3600, s-maxage=86400" } });
  } catch {
    return Response.json({ error: live ? "Warnungsdaten oder Quellenaktualität derzeit nicht verlässlich verfügbar." : "Quelldaten derzeit nicht vollständig verfügbar." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
