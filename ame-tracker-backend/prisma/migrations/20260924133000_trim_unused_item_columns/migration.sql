-- Item.sourceItemTrackingId duplicated the unit row and was never read.
-- ItemUnit.trackingJson was written and never used by scan or reports.
ALTER TABLE "items" DROP COLUMN IF EXISTS "source_item_tracking_id";
ALTER TABLE "item_units" DROP COLUMN IF EXISTS "tracking_json";
