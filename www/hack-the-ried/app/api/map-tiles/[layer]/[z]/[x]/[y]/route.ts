import { proxyBackend } from "@/lib/collectedBackend";

export async function GET(_request: Request, { params }: { params: Promise<{layer:string; z:string; x:string; y:string}> }) {
  const {layer,z,x,y} = await params;
  if (!/^(base|rain|lora)$/.test(layer) || !/^\d+$/.test(z) || !/^\d+$/.test(x) || !/^\d+\.png$/.test(y)) return new Response(null,{status:404});

  if (layer === "lora") {
    try {
      const upstream = await fetch(`https://tms.ttnmapper.org/circles/network/NS_TTS_V3%3A%2F%2Fttn%40000013/${z}/${x}/${y}`, {
        headers: {
          "Referer": "https://ttnmapper.org/",
          "User-Agent": "Mozilla/5.0 (compatible; OpenRiedSens/1.0)",
        },
        next: { revalidate: 86400 },
        signal: AbortSignal.timeout(10000),
      });
      if (!upstream.ok) return new Response(null, { status: upstream.status });
      return new Response(await upstream.arrayBuffer(), {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=86400, s-maxage=86400",
        },
      });
    } catch {
      return new Response(null, { status: 502 });
    }
  }

  return proxyBackend(`map-tiles/${layer}/${z}/${x}/${y}`, 86400);
}
