ALTER TABLE qr_scan_events
    DROP CONSTRAINT IF EXISTS qr_scan_events_qr_id_check;

ALTER TABLE qr_scan_events
    ADD CONSTRAINT qr_scan_events_qr_id_check
    CHECK (qr_id IN ('1', '2', '3', '4', '5', '6', '7', '8', '9', '10'));
