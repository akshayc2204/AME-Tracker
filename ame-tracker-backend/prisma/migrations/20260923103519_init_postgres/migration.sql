-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ADMIN',
    "is_active" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" SERIAL NOT NULL,
    "source_project_id" INTEGER,
    "project_name" TEXT NOT NULL,
    "project_type" TEXT NOT NULL DEFAULT 'EXTERNAL',
    "is_active" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER,
    "source_job_id" TEXT NOT NULL,
    "job_name" TEXT NOT NULL,
    "label_color" TEXT,
    "is_active" INTEGER NOT NULL DEFAULT 1,
    "is_completed" INTEGER,
    "source_file" TEXT,
    "import_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_archives" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER,
    "project_name" TEXT,
    "source_job_id" TEXT NOT NULL,
    "job_name" TEXT NOT NULL,
    "import_version" INTEGER NOT NULL,
    "total_parts" INTEGER NOT NULL DEFAULT 0,
    "archived_by_user_id" INTEGER,
    "archived_by_name" TEXT,
    "archived_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_archives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" SERIAL NOT NULL,
    "job_id" INTEGER NOT NULL,
    "source_item_id" INTEGER NOT NULL,
    "piece_number" TEXT,
    "fitting" TEXT,
    "metal" TEXT,
    "liner" TEXT,
    "dimensions" TEXT,
    "instructions" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "is_fitting" INTEGER NOT NULL DEFAULT 0,
    "metric_weight" DOUBLE PRECISION,
    "weight" DOUBLE PRECISION,
    "metric_area" DOUBLE PRECISION,
    "area" DOUBLE PRECISION,
    "gauge" INTEGER,
    "alpha_number" TEXT,
    "drawing" TEXT,
    "floor" TEXT,
    "system_name" TEXT,
    "pressure" TEXT,
    "schedule_json" TEXT,
    "tracking_status" TEXT,
    "status_sequence" INTEGER,
    "storage" TEXT,
    "location" TEXT,
    "container" TEXT,
    "in_container" INTEGER NOT NULL DEFAULT 0,
    "source_item_tracking_id" INTEGER,
    "is_manual" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_units" (
    "id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "job_id" INTEGER NOT NULL,
    "unit_index" INTEGER NOT NULL DEFAULT 1,
    "qr_code" TEXT NOT NULL,
    "source_qty_guid_id" INTEGER,
    "guid_in_use" INTEGER NOT NULL DEFAULT 0,
    "has_source_qr" INTEGER NOT NULL DEFAULT 0,
    "source_item_tracking_id" INTEGER,
    "tracking_status" TEXT,
    "status_sequence" INTEGER,
    "tracking_date" TIMESTAMP(3),
    "storage" TEXT,
    "location" TEXT,
    "container" TEXT,
    "in_container" INTEGER NOT NULL DEFAULT 0,
    "piece_nbr" TEXT,
    "fitting" TEXT,
    "description" TEXT,
    "scan_date" TEXT,
    "component" INTEGER NOT NULL DEFAULT 0,
    "back_ordered" TEXT,
    "tracking_json" TEXT,
    "current_status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracking_events" (
    "id" SERIAL NOT NULL,
    "item_unit_id" INTEGER NOT NULL,
    "tracking_identifier" TEXT,
    "qr_code" TEXT,
    "event_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "user_id" INTEGER,
    "dispatch_id" INTEGER,
    "vehicle_number" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracking_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatches" (
    "id" SERIAL NOT NULL,
    "job_id" INTEGER NOT NULL,
    "vehicle_number" TEXT,
    "vehicle_image_path" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "created_by" INTEGER,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "dispatches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatch_parts" (
    "id" SERIAL NOT NULL,
    "dispatch_id" INTEGER NOT NULL,
    "item_unit_id" INTEGER NOT NULL,
    "loaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "loaded_by" INTEGER,

    CONSTRAINT "dispatch_parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" SERIAL NOT NULL,
    "job_id" INTEGER,
    "t4vjob_filename" TEXT,
    "fabshop_filename" TEXT,
    "job_report_filename" TEXT,
    "status" TEXT NOT NULL,
    "total_fabshop_rows" INTEGER DEFAULT 0,
    "matched_rows" INTEGER DEFAULT 0,
    "unmatched_rows" INTEGER DEFAULT 0,
    "conflict_rows" INTEGER DEFAULT 0,
    "duplicate_rows" INTEGER DEFAULT 0,
    "uploaded_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_errors" (
    "id" SERIAL NOT NULL,
    "import_batch_id" INTEGER NOT NULL,
    "source_file" TEXT NOT NULL,
    "row_number" INTEGER,
    "error_type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "raw_data" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_errors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_syncs" (
    "id" SERIAL NOT NULL,
    "pair_key" TEXT NOT NULL,
    "t4vjob_path" TEXT NOT NULL,
    "xlsx_path" TEXT NOT NULL,
    "t4vjob_hash" TEXT NOT NULL,
    "xlsx_hash" TEXT NOT NULL,
    "source_job_id" TEXT,
    "job_id" INTEGER,
    "import_batch_id" INTEGER,
    "status" TEXT NOT NULL,
    "items_imported" INTEGER NOT NULL DEFAULT 0,
    "units_imported" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_syncs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "before_json" TEXT,
    "after_json" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "projects_source_project_id_key" ON "projects"("source_project_id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_project_name_key" ON "projects"("project_name");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_source_job_id_key" ON "jobs"("source_job_id");

-- CreateIndex
CREATE INDEX "idx_jobs_project" ON "jobs"("project_id");

-- CreateIndex
CREATE INDEX "idx_job_archives_source" ON "job_archives"("source_job_id");

-- CreateIndex
CREATE INDEX "idx_job_archives_date" ON "job_archives"("archived_at");

-- CreateIndex
CREATE INDEX "idx_items_job" ON "items"("job_id");

-- CreateIndex
CREATE INDEX "idx_items_gauge" ON "items"("gauge");

-- CreateIndex
CREATE INDEX "idx_items_metal" ON "items"("metal");

-- CreateIndex
CREATE INDEX "idx_items_alpha" ON "items"("job_id", "alpha_number");

-- CreateIndex
CREATE UNIQUE INDEX "items_job_id_source_item_id_key" ON "items"("job_id", "source_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "item_units_qr_code_key" ON "item_units"("qr_code");

-- CreateIndex
CREATE UNIQUE INDEX "item_units_source_qty_guid_id_key" ON "item_units"("source_qty_guid_id");

-- CreateIndex
CREATE UNIQUE INDEX "item_units_source_item_tracking_id_key" ON "item_units"("source_item_tracking_id");

-- CreateIndex
CREATE INDEX "idx_item_units_job" ON "item_units"("job_id");

-- CreateIndex
CREATE INDEX "idx_item_units_qr" ON "item_units"("qr_code");

-- CreateIndex
CREATE INDEX "idx_item_units_status" ON "item_units"("current_status");

-- CreateIndex
CREATE INDEX "idx_item_units_tracking_id" ON "item_units"("source_item_tracking_id");

-- CreateIndex
CREATE UNIQUE INDEX "item_units_item_id_unit_index_key" ON "item_units"("item_id", "unit_index");

-- CreateIndex
CREATE INDEX "idx_tracking_unit" ON "tracking_events"("item_unit_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_tracking_qr" ON "tracking_events"("qr_code");

-- CreateIndex
CREATE INDEX "idx_dispatch_units" ON "dispatch_parts"("dispatch_id", "item_unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "dispatch_parts_dispatch_id_item_unit_id_key" ON "dispatch_parts"("dispatch_id", "item_unit_id");

-- CreateIndex
CREATE INDEX "idx_file_syncs_pair" ON "file_syncs"("pair_key");

-- CreateIndex
CREATE INDEX "idx_file_syncs_job" ON "file_syncs"("source_job_id");

-- CreateIndex
CREATE UNIQUE INDEX "file_syncs_pair_key_t4vjob_hash_xlsx_hash_key" ON "file_syncs"("pair_key", "t4vjob_hash", "xlsx_hash");

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_units" ADD CONSTRAINT "item_units_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_units" ADD CONSTRAINT "item_units_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_events" ADD CONSTRAINT "tracking_events_item_unit_id_fkey" FOREIGN KEY ("item_unit_id") REFERENCES "item_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_events" ADD CONSTRAINT "tracking_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_parts" ADD CONSTRAINT "dispatch_parts_dispatch_id_fkey" FOREIGN KEY ("dispatch_id") REFERENCES "dispatches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_parts" ADD CONSTRAINT "dispatch_parts_item_unit_id_fkey" FOREIGN KEY ("item_unit_id") REFERENCES "item_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_parts" ADD CONSTRAINT "dispatch_parts_loaded_by_fkey" FOREIGN KEY ("loaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_errors" ADD CONSTRAINT "import_errors_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
