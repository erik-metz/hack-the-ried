# RAK firmware releases

- Every new `vN/` directory must include a standalone `payload-formatter.js`
  compatible with that directory's firmware and all payload formats it can emit.
  Link that local file in the version's README and install it in TTN before flashing.
- `v1/payload-formatter.js` is the central development/compatibility copy. When
  changing the current protocol, update it and the newest version's decoder
  snapshot together. Do not rewrite older snapshots for a new release; only
  change them when fixing their own decoding behavior.
- Run `node --test hardware/sensor-node/rak3112/v1/*test.mjs` from the repository
  root. The release checks must cover any new wire format, including optional
  formats emitted when sensors are absent. The existing firmware build and live
  verification requirements still apply when firmware behavior changes.
