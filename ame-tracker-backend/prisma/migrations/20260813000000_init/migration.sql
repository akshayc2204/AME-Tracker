-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token_hash" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" DATETIME,
    CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "account_number" TEXT,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "client_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "projects_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "source_job_id" TEXT,
    "download_id" TEXT,
    "description" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "jobs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "job_id" TEXT NOT NULL,
    "source_system" TEXT NOT NULL DEFAULT 'T4V',
    "source_piece_id" TEXT,
    "source_item_id" TEXT,
    "piece_number" TEXT NOT NULL,
    "fitting" TEXT,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PACKED',
    "specs" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "products_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "qr_codes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "product_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "source_fab_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "qr_codes_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "transits" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transit_number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "truck_photo_url" TEXT,
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" DATETIME,
    "created_by" TEXT NOT NULL,
    "completed_by" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "transits_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "transits_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "transit_products" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transit_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "scanned_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scanned_by" TEXT NOT NULL,
    "request_id" TEXT,
    CONSTRAINT "transit_products_transit_id_fkey" FOREIGN KEY ("transit_id") REFERENCES "transits" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "transit_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "transit_products_scanned_by_fkey" FOREIGN KEY ("scanned_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "loading_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "product_id" TEXT,
    "transit_id" TEXT,
    "event_type" TEXT NOT NULL,
    "user_id" TEXT,
    "metadata" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "loading_events_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "loading_events_transit_id_fkey" FOREIGN KEY ("transit_id") REFERENCES "transits" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "loading_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "file_imports" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "job_code_hint" TEXT,
    "client_id" TEXT,
    "vjob_path" TEXT,
    "fabshop_path" TEXT,
    "xlsx_path" TEXT,
    "preview" TEXT,
    "summary" TEXT,
    "error_message" TEXT,
    "created_by" TEXT NOT NULL,
    "validated_at" DATETIME,
    "imported_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "file_imports_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "file_import_records" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "import_id" TEXT NOT NULL,
    "record_type" TEXT NOT NULL,
    "external_key" TEXT,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "payload" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "file_import_records_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "file_imports" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "metadata" TEXT,
    "ip_address" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "transit_sequences" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "value" INTEGER NOT NULL DEFAULT 0
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "clients_name_key" ON "clients"("name");

-- CreateIndex
CREATE INDEX "projects_code_idx" ON "projects"("code");

-- CreateIndex
CREATE UNIQUE INDEX "projects_client_id_code_key" ON "projects"("client_id", "code");

-- CreateIndex
CREATE INDEX "jobs_source_job_id_idx" ON "jobs"("source_job_id");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_code_key" ON "jobs"("code");

-- CreateIndex
CREATE INDEX "products_status_idx" ON "products"("status");

-- CreateIndex
CREATE INDEX "products_piece_number_idx" ON "products"("piece_number");

-- CreateIndex
CREATE UNIQUE INDEX "products_source_system_job_id_source_piece_id_key" ON "products"("source_system", "job_id", "source_piece_id");

-- CreateIndex
CREATE UNIQUE INDEX "qr_codes_product_id_key" ON "qr_codes"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "qr_codes_code_key" ON "qr_codes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "transits_transit_number_key" ON "transits"("transit_number");

-- CreateIndex
CREATE INDEX "transits_status_idx" ON "transits"("status");

-- CreateIndex
CREATE INDEX "transits_started_at_idx" ON "transits"("started_at");

-- CreateIndex
CREATE UNIQUE INDEX "transit_products_request_id_key" ON "transit_products"("request_id");

-- CreateIndex
CREATE INDEX "transit_products_transit_id_idx" ON "transit_products"("transit_id");

-- CreateIndex
CREATE UNIQUE INDEX "transit_products_transit_id_product_id_key" ON "transit_products"("transit_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "transit_products_product_id_key" ON "transit_products"("product_id");

-- CreateIndex
CREATE INDEX "loading_events_product_id_created_at_idx" ON "loading_events"("product_id", "created_at");

-- CreateIndex
CREATE INDEX "loading_events_transit_id_idx" ON "loading_events"("transit_id");

-- CreateIndex
CREATE INDEX "file_imports_status_idx" ON "file_imports"("status");

-- CreateIndex
CREATE INDEX "file_import_records_import_id_status_idx" ON "file_import_records"("import_id", "status");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");
