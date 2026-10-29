ALTER TABLE newsletter_subscribers
    ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'newsletter',
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS location TEXT,
    ADD COLUMN IF NOT EXISTS interest TEXT;

ALTER TABLE newsletter_subscribers
    DROP CONSTRAINT IF EXISTS newsletter_subscribers_pkey;

ALTER TABLE newsletter_subscribers
    ADD CONSTRAINT newsletter_subscribers_pkey PRIMARY KEY (email, category);

ALTER TABLE newsletter_subscribers
    DROP CONSTRAINT IF EXISTS newsletter_subscribers_category_check;

ALTER TABLE newsletter_subscribers
    ADD CONSTRAINT newsletter_subscribers_category_check
    CHECK (category IN ('newsletter', 'sensor-workshop'));
