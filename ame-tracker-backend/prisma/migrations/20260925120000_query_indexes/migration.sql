-- Speed up status counts, dashboard date scans, and dispatch filters.
CREATE INDEX "idx_item_units_job_status" ON "item_units"("job_id", "current_status");
CREATE INDEX "idx_tracking_type_created" ON "tracking_events"("event_type", "created_at");
CREATE INDEX "idx_dispatches_status" ON "dispatches"("status");
CREATE INDEX "idx_dispatches_started" ON "dispatches"("started_at");
