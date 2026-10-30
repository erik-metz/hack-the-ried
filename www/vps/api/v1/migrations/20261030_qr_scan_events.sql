CREATE TABLE IF NOT EXISTS qr_scan_events (
    id BIGSERIAL PRIMARY KEY,
    qr_id TEXT NOT NULL CHECK (qr_id IN ('1', '2', '3', '4', '5')),
    scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    referrer_host TEXT,
    user_agent TEXT,
    campaign JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_qr_scan_events_scanned_at_qr_id
    ON qr_scan_events (scanned_at, qr_id);
