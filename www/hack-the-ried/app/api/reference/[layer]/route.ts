import { referenceProxy } from "@/lib/referenceProxy";
export async function GET(_request: Request, context: { params: Promise<{ layer: string }> }) {
  const { layer } = await context.params;
  if (!/^[a-z-]{1,60}$/.test(layer)) return Response.json({ error: "Ungültige Ebene" }, { status: 400 });
  return referenceProxy(layer);
}
