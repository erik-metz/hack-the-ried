const API_ROOT = "https://www.xn--mngelmelder-l8a.de/api/v1/domain/32/message/";
const IMAGE_HOST = "td50285-wdw.s3-de.teledata.cloud";

type PublicAttachment = { public?: boolean; content_type?: string; url?: string; thumbnails?: Record<string, unknown> };

function publicImageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value, "https://www.xn--mngelmelder-l8a.de");
    return url.protocol === "https:" && ["www.xn--mngelmelder-l8a.de", IMAGE_HOST].includes(url.hostname)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,12}$/.test(id)) return Response.json({ error: "Ungültige Meldungs-ID" }, { status: 400 });

  try {
    const response = await fetch(`${API_ROOT}${id}`, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return Response.json({ error: "Meldungsdetails nicht verfügbar" }, { status: 502 });
    const body = await response.json();
    const message = body?.success === true ? body.data : null;
    if (!message || String(message.id) !== id) return Response.json({ error: "Meldung nicht gefunden" }, { status: 404 });

    const images = (Array.isArray(message.attachments) ? message.attachments as PublicAttachment[] : [])
      .filter(file => file?.public === true && typeof file.content_type === "string" && file.content_type.startsWith("image/"))
      .map(file => ({
        preview: publicImageUrl(file.thumbnails?.res800) ?? publicImageUrl(file.thumbnails?.w800) ?? publicImageUrl(file.url),
        original: publicImageUrl(file.url),
      }))
      .filter((file): file is { preview: string; original: string } => Boolean(file.preview && file.original))
      .slice(0, 8);

    return Response.json({
      id,
      category: typeof message.message_type?.name === "string" ? message.message_type.name : null,
      status: typeof message.state_german === "string" ? message.state_german : typeof message.state === "string" ? message.state : null,
      reportedAt: typeof message.created === "string" ? message.created : null,
      description: typeof message.text === "string" ? message.text.slice(0, 12000) : null,
      images,
    }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } });
  } catch {
    return Response.json({ error: "Meldungsdetails derzeit nicht erreichbar" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
