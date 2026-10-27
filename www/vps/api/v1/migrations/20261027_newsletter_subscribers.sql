CREATE TABLE IF NOT EXISTS newsletter_subscribers (
    email TEXT PRIMARY KEY,
    consented_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    consent_text_version TEXT NOT NULL,
    unsubscribed_at TIMESTAMPTZ,
    CHECK (email = lower(btrim(email))),
    CHECK (length(email) BETWEEN 3 AND 254)
);

CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_active
    ON newsletter_subscribers (consented_at)
    WHERE unsubscribed_at IS NULL;
