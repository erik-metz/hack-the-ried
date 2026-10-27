
-- Authorized browser map acquisition, separate operational identity from AISstream.
INSERT INTO collection_sources(id,source_url,adapter,enabled,interval_seconds,description)
VALUES ('rhein-map','urn:hack-the-ried:rhine-map','rhine-map-browser',true,300,
    'Authorized Rhine map reception Frankenthal–Gernsheim; provider observation times preserved')
ON CONFLICT(id) DO NOTHING;
