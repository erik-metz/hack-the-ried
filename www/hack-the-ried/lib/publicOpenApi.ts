type JsonObject = { [key: string]: unknown };

const PUBLIC_TAGS = new Set(["Sensors Public", "Telemetry Public", "Archives Public", "Downloads Public"]);
export const PUBLIC_API_URL = "https://api.hack-the-ried.de";

function object(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid OpenAPI object");
  return value as JsonObject;
}

/** Export public read operations and only the components they reference. */
export function publicOpenApi(input: unknown) {
  const source = object(input);
  if (typeof source.openapi !== "string" || !source.openapi.startsWith("3.")) throw new Error("Unsupported OpenAPI version");
  const paths: JsonObject = {};
  for (const [path, value] of Object.entries(object(source.paths))) {
    const item = object(value);
    if (!item.get || !path.startsWith("/api/v1/") || path.startsWith("/api/v1/admin/")) continue;
    const operation = object(item.get);
    const security = operation.security ?? source.security;
    if (security !== undefined && (!Array.isArray(security) || security.length > 0)) continue;
    if (!Array.isArray(operation.tags) || !operation.tags.some(tag => typeof tag === "string" && PUBLIC_TAGS.has(tag))) continue;
    // Do not retain operation-specific servers or callbacks from the full schema.
    const { servers: _servers, callbacks: _callbacks, ...readOperation } = operation;
    void _servers;
    void _callbacks;
    paths[path] = {
      ...(item.parameters ? { parameters: item.parameters } : {}),
      get: { ...readOperation, tags: operation.tags.filter(tag => typeof tag === "string" && PUBLIC_TAGS.has(tag)), security: [] },
    };
  }
  if (!Object.keys(paths).length) throw new Error("No public endpoints available");

  const components: Record<string, JsonObject> = {};
  const visited = new Set<string>();
  function collect(value: unknown) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(collect); return; }
    const record = object(value);
    if (typeof record.$ref === "string" && !visited.has(record.$ref)) {
      visited.add(record.$ref);
      const match = /^#\/components\/([^/]+)\/([^/]+)$/.exec(record.$ref);
      if (!match) throw new Error("Unsupported schema reference");
      const [, group, encodedName] = match;
      const name = encodedName.replaceAll("~1", "/").replaceAll("~0", "~");
      const component = object(object(source.components)[group])[name];
      if (!component || group === "securitySchemes") throw new Error("Invalid public schema reference");
      components[group] ??= {};
      components[group][name] = component;
      collect(component);
    }
    Object.values(record).forEach(collect);
  }
  collect(paths);
  return {
    openapi: source.openapi,
    info: {
      title: "HackTheRied – Public API",
      version: object(source.info).version,
      description: "Public environmental sensor data. No authentication required. Start with GET /api/v1/sensors, then use a returned id for sensor_id or the station path parameter. Historical queries require start_time in ISO-8601 UTC format.",
    },
    servers: [{ url: PUBLIC_API_URL }],
    security: [],
    paths,
    components,
  };
}
