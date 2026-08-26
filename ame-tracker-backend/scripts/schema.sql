-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'OPERATOR');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('PACKED', 'LOADED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TransitStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('UPLOADED', 'VALIDATED', 'IMPORTED', 'FAILED');

-- CreateEnum
CREATE TYPE "LoadingEventType" AS ENUM ('PRODUCT_IMPORTED', 'PRODUCT_PACKED', 'PRODUCT_LOADED', 'PRODUCT_REMOVED', 'TRANSIT_CREATED', 'TRANSIT_COMPLETED', 'TRANSIT_CANCELLED', 'CORRECTION');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "account_number" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "source_job_id" TEXT,
    "download_id" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "source_system" TEXT NOT NULL DEFAULT 'T4V',
    "source_piece_id" TEXT,
    "source_item_id" TEXT,
    "piece_number" TEXT NOT NULL,
    "fitting" TEXT,
    "description" TEXT,
    "status" "ProductStatus" NOT NULL DEFAULT 'PACKED',
    "specs" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_codes" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "source_fab_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qr_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transits" (
    "id" TEXT NOT NULL,
    "transit_number" TEXT NOT NULL,
    "status" "TransitStatus" NOT NULL DEFAULT 'ACTIVE',
    "truck_photo_url" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "completed_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transit_products" (
    "id" TEXT NOT NULL,
    "transit_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "scanned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scanned_by" TEXT NOT NULL,
    "request_id" TEXT,

    CONSTRAINT "transit_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loading_events" (
    "id" TEXT NOT NULL,
    "product_id" TEXT,
    "transit_id" TEXT,
    "event_type" "LoadingEventType" NOT NULL,
    "user_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loading_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_imports" (
    "id" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "job_code_hint" TEXT,
    "client_id" TEXT,
    "vjob_path" TEXT,
    "fabshop_path" TEXT,
    "xlsx_path" TEXT,
    "preview" JSONB,
    "summary" JSONB,
    "error_message" TEXT,
    "created_by" TEXT NOT NULL,
    "validated_at" TIMESTAMP(3),
    "imported_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "file_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_import_records" (
    "id" TEXT NOT NULL,
    "import_id" TEXT NOT NULL,
    "record_type" TEXT NOT NULL,
    "external_key" TEXT,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_import_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "metadata" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transit_sequences" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "transit_sequences_pkey" PRIMARY KEY ("id")
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

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transits" ADD CONSTRAINT "transits_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transits" ADD CONSTRAINT "transits_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transit_products" ADD CONSTRAINT "transit_products_transit_id_fkey" FOREIGN KEY ("transit_id") REFERENCES "transits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transit_products" ADD CONSTRAINT "transit_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transit_products" ADD CONSTRAINT "transit_products_scanned_by_fkey" FOREIGN KEY ("scanned_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loading_events" ADD CONSTRAINT "loading_events_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loading_events" ADD CONSTRAINT "loading_events_transit_id_fkey" FOREIGN KEY ("transit_id") REFERENCES "transits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loading_events" ADD CONSTRAINT "loading_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_imports" ADD CONSTRAINT "file_imports_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_import_records" ADD CONSTRAINT "file_import_records_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "file_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

