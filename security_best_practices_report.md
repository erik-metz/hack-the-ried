# Security review: VPS and HackTheRied

## Remediation status — 2026-09-14

All six findings below have been addressed in the working tree. The original
review is preserved below as the record of the pre-fix behavior.

- Password verification now applies in every environment.
- The backend requires distinct ingestion and admin keys at startup; admin
  verification, Compose and collector registration no longer fall back.
- Map markers use DOM nodes and `textContent` for sensor IDs.
- Compose no longer publishes database or plaintext backend ports.
- Aggregate queries have a 31-day range cap, 2,000-bucket cap, 5,000-row cap and
  five-second statement timeout. Pool queues and nginx traffic are bounded.
- Sessions use a required independent 32-byte signing secret, with strict
  timestamp/signature validation and rejection of expired or future tokens.

Deployment requires setting `ADMIN_SESSION_SECRET` (generate using
`openssl rand -hex 32`) on the frontend and distinct `API_KEY`/`ADMIN_API_KEY`
values on the VPS. Recreate Compose services to remove existing port bindings;
image updates alone do not change them. Existing admin cookies will be invalid.
See the frontend and VPS READMEs for rollout details.

Validation: frontend security regression tests, API regression tests, TypeScript
checking, production Next.js build with synthetic configuration, targeted lint,
and Compose configuration validation. Docker was unavailable locally, so running
containers, nginx configuration loading and live database timeouts still require
deployment verification. The additional frontend ingress verification and
documented archive publication policy below remain operational considerations.

Reviewed 2026-09-13. Scope: `www/vps/` and `www/open-ried-sens/`, including FastAPI endpoints, Next.js actions and routes, map rendering, Compose/nginx deployment, collector, and archive handling.

## Executive summary

Six actionable issues: four high and two medium. Prioritize the development login bypass, ingestion-to-admin key fallback, raw HTML map marker, and directly published infrastructure ports. Exploit prerequisites are described below; this review does not establish that the production deployment has been compromised or is externally reachable on those ports.

Review used source inspection and isolated local execution with synthetic credentials. No production requests, destructive tests, or application changes were made. This is not a complete dependency advisory audit; installed production versions, firewall rules, proxy behavior, and secret strength were not verified.

## High severity

### 1. Development login accepts any nonempty password

- **Rule:** authentication bypass / CWE-287.
- **Location:** `www/open-ried-sens/app/admin/actions.ts:102–112` (`loginAction`).
- **Evidence:** password mismatch is rejected only when `process.env.NODE_ENV === "production"`; other modes issue a normally signed admin cookie.
- **Impact:** anyone able to reach a development/preview instance can list hidden sensors, create or edit metadata, and change visibility using its configured backend credentials. Permanent deletion still separately checks the password. If development and production share the password, the resulting cookie is also cryptographically valid in production.
- **Validation:** transpiled and invoked the actual action with mocked Next.js headers/cookies and a wrong synthetic password: development returned success and issued a cookie; production rejected it.
- **Fix:** enforce password verification in every mode. Use separate development credentials and backend data. Restrict access to development servers until fixed.
- **Qualification:** this is not an unconditional production login bypass; exposure requires a reachable nonproduction instance or shared secrets with one.

### 2. Missing admin key promotes ingestion credentials to administrator

- **Rule:** privilege separation / CWE-269.
- **Locations:** `www/vps/api/v1/dependencies.py:38–43`; `www/vps/docker-compose.yml:29–30`.
- **Evidence:** `ADMIN_API_KEY` falls back to `API_KEY` in both application code and Compose.
- **Impact:** when the dedicated admin key is absent or empty, a telemetry producer or someone who obtains its key can invoke all admin endpoints, including permanent telemetry deletion. Merely possessing ingestion credentials should not grant this authority.
- **Validation:** traced the fallback into all admin route dependencies and the `purge_telemetry` deletion path in `www/vps/api/v1/endpoints/sensors.py`.
- **Fix:** require a distinct nonempty admin key at startup and in Compose; remove the fallback. Reject equal ingestion/admin keys. Provision metadata separately where possible so routine ingestion does not need administrator credentials.
- **Qualification:** a deployment with distinct configured keys avoids this fallback. Existing credentials were not inspected.

### 3. Sensor IDs reach a raw HTML map marker

- **Rule:** stored XSS / CWE-79.
- **Locations:** `www/open-ried-sens/app/components/MapComponent.tsx:102–108`; `www/open-ried-sens/app/page.tsx:45–54`; `www/vps/api/v1/schemas.py:5`.
- **Evidence:** `${node.id.split("-")[1] || node.id}` is interpolated into HTML passed to `L.divIcon`. The API accepts sensor IDs based on length alone. The installed Leaflet implementation assigns this string to `innerHTML` (`node_modules/leaflet/dist/leaflet-src.js:11086`). Leaflet documents this option as [custom HTML](https://leafletjs.com/reference#divicon).
- **Impact:** an attacker able to create a sensor ID and arrange public coordinates can persist executable markup affecting dashboard visitors. Execution occurs on the application origin, including in an administrator's browser; HttpOnly cookies do not prevent scripts from making authenticated same-origin requests.
- **Validation:** the benign demonstration string `<img src=x onerror=alert(1)>` fits the 64-character metadata limit and survives the exact split expression unchanged. Source tracing confirms it reaches the HTML sink. No payload was saved to a database or executed in a live browser.
- **Fix:** construct the icon using DOM nodes, set the label with `textContent`, and pass the HTMLElement to Leaflet. Add a suitable sensor-ID allowlist as defense in depth.
- **Qualification:** ingestion alone auto-registers IDs without coordinates, which the homepage filters out. Rendering requires coordinates to be supplied later or access to metadata registration; finding 2 can provide that access under its stated configuration.

### 4. Database and unencrypted backend published on host interfaces

- **Rule:** unnecessary network exposure / CWE-668.
- **Locations:** `www/vps/docker-compose.yml:10–11,19–22`; `www/vps/nginx.conf:16–38`.
- **Evidence:** `5432:5432` and `8080:8080` lack host-IP restrictions. Uvicorn serves HTTP; nginx supplies the HTTPS boundary. Docker normally publishes such mappings on all host addresses ([Docker documentation](https://docs.docker.com/engine/network/port-publishing/)).
- **Impact:** reachable port 8080 bypasses nginx TLS and its request handling limits; clients using that listener send bearer keys over plaintext. Port 5432 exposes the database login/service directly to network attackers. Database authentication is still required; this is not a proven database compromise.
- **Fix:** remove both host port mappings and use the Compose network for service traffic. Bind to `127.0.0.1` only if host-side access is required, and use SSH tunneling for database administration. Verify restrictions from an external host after deployment.
- **Qualification:** external firewall rules or Docker daemon overrides may prevent Internet access. Neither was available for verification.

## Medium severity

### 5. Public aggregate queries have no work or result bound

- **Rule:** uncontrolled resource consumption / CWE-400.
- **Location:** `www/vps/api/v1/endpoints/telemetry.py:153–206` (`get_telemetry_aggregates`); pool setup in `www/vps/api/v1/main.py:42–46`.
- **Evidence:** unauthenticated callers select arbitrary date ranges and one-minute buckets; the query aggregates the full matching range and calls `fetchall()` without a row limit. No application statement timeout or nginx request-rate limit is configured in the reviewed files.
- **Impact:** repeated full-history queries can consume database CPU, pool connections, and API memory as telemetry grows. Next.js's fixed dashboard window does not protect the directly exposed backend endpoint.
- **Validation:** traced public routing, input validation, SQL execution and materialization. No load test was performed; actual impact depends on dataset size, indexing, and deployment limits.
- **Fix:** cap date spans and bucket counts, require coarser intervals for long ranges, configure a database statement timeout, and limit concurrent/rate-intensive requests. Direct bulk downloads to the archive feature.
- **Qualification:** external rate controls or database-level timeouts may mitigate this; those settings were not available.

### 6. Session signatures expose an offline password verifier

- **Rule:** inappropriate use of password as signing key / CWE-321-related key management weakness.
- **Locations:** `www/open-ried-sens/lib/adminAuth.ts:15–21,41–44`; `www/open-ried-sens/env.ts:8`.
- **Evidence:** a cookie contains a known timestamp and `HMAC-SHA256(ADMIN_PASSWORD, "admin-session:" + timestamp)`. Password validation accepts any nonempty configured password.
- **Impact:** someone who obtains a session token can test password guesses offline with fast HMAC operations, bypassing login throttling. Recovery of a weak password grants lasting login and cookie-forging ability. Finding 1 can supply a token if an accessible development instance shares that password.
- **Validation:** generated a token with the actual transpiled helper and a synthetic password, then successfully checked the password using only its timestamp/signature and an independent HMAC calculation.
- **Fix:** use a separate randomly generated session signing secret (at least 32 random bytes), require it at startup, and keep password authentication separate. Rotate the signing secret and invalidate existing cookies when deploying the change.
- **Qualification:** token possession is required; a sufficiently random admin password makes guessing impractical. The actual password's entropy was not evaluated.

## Additional deployment checks and accepted behavior

- `app/admin/actions.ts:89–93` trusts the first `x-forwarded-for` entry for login throttling. Verify that the Next.js hosting ingress overwrites client-supplied values and prevents direct bypass. Its in-memory limiter is per process, so it is not a shared distributed limit. The supplied nginx fronts FastAPI, not Next.js; its configuration does not establish how the frontend is protected. Use a trusted ingress identifier and shared limiter if deployed across instances.
- Archive URLs are public and remain usable until worker deletion/CDN expiry after a sensor is hidden. The worker runs daily in watch mode. This is explicitly documented in `www/vps/archive-worker/README.md:62–66`, so it is treated as an accepted publication policy rather than a new vulnerability. Immediate revocation would require a different download authorization/storage design.
- Parameterized SQL, admin checks on management routes/actions, public sensor visibility filtering, generic frontend backend-error responses, secure production cookie flags, and CSV formula neutralization are present. Public read-only data access, permissive noncredentialed CORS, and public API documentation match the open-data purpose.

## Suggested fix order

1. Enforce login checks in all modes and require separate admin/ingestion keys.
2. Remove raw HTML interpolation and unnecessary published ports.
3. Bound aggregate query work and introduce an independent session signing secret.
4. Verify frontend ingress/rate limiting and deployed dependency versions.
