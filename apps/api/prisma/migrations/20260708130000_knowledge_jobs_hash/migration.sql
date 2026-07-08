-- Idempotency + jobs + audit for Pro Knowledge Core.

-- Documents: drop the strict unique (allow same path across projects) and add content hash.
DROP INDEX IF EXISTS "documents_user_id_source_path_key";
ALTER TABLE "documents" ADD COLUMN "content_hash" TEXT;
CREATE INDEX "documents_user_id_source_path_idx" ON "documents"("user_id", "source", "path");

-- Ingestion jobs (synchronous today; BullMQ-ready).
CREATE TABLE "ingestion_jobs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "project_id" UUID,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "total_files" INTEGER NOT NULL DEFAULT 0,
    "processed_files" INTEGER NOT NULL DEFAULT 0,
    "failed_files" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    CONSTRAINT "ingestion_jobs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ingestion_jobs_user_id_created_at_idx" ON "ingestion_jobs"("user_id", "created_at");
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Action logs (basic orchestrator audit).
CREATE TABLE "action_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "task_type" TEXT NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "knowledge_sources" INTEGER NOT NULL DEFAULT 0,
    "tools_used" TEXT[],
    "estimated_cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "action_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "action_logs_user_id_created_at_idx" ON "action_logs"("user_id", "created_at");
ALTER TABLE "action_logs" ADD CONSTRAINT "action_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
