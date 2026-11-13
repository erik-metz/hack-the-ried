# Regional reference data: initial production validation

On 2026-11-13 the new adapters were run against the existing VPS database.
The existing canonical storage cutover (`core_storage`, `measurement_heads`)
was verified before import. No database migration, TimescaleDB restart or
cancellation of another collector's transaction was performed.

An existing long-running historical DELETE initially blocked selected chunks.
Only the staging import's own waiting statements were cancelled. The final
adapters have bounded lock/statement timeouts and retry independently. After
the pre-existing transaction finished, all 15 configured sources imported
successfully. Read-only calls of the new API handlers against production
returned all complete publications:

| Publication | Regional records |
| --- | ---: |
| Grundradar catalogue (metadata, not measurement data) | 47 |
| Municipal Grundsteuer B rates | 4 |
| County land-value aggregates | 3 |
| Flood scenarios | 80 |
| Protected areas | 47 |
| Environmental monitoring inventory | 63 |
| Zensus 2022 population and housing | 436 |
| Land cover | 8,306 |
| Drinking-water protection | 42 |
| Geology | 106 |
| Soil | 16 |
| KOSTRA rainfall | 48 |
| Mean groundwater distance | 494 |
| UHI additional tropical nights, 2024 | 520 |
| Geogenic radon potential | 12 |

Counts describe this import and the configured viewport; they are not constants
or a claim that the whole Hessian Ried has complete coverage. The catalogue
also contains themes that are not yet imported. In particular EGMS requires
additional authenticated provider access. See the detailed source contracts
and limitations in [REFERENCE_DATA.md](registry-sync-worker/REFERENCE_DATA.md).

Local validation: 334 frontend tests, TypeScript, ESLint on changed frontend
files and production build passed. Collector/API tests exercised PostgreSQL
in isolated schemas, including raster units, replay and transactional failures;
GitHub CI supplies the supported Linux/TimescaleDB verification. CI/GHCR and
live deployment results are recorded in the delivery message, not inferred
from these initial imports.
