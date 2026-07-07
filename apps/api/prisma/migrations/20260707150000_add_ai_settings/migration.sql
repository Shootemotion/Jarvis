-- Per-user AI preferences + BYO (bring-your-own) encrypted API keys.
CREATE TABLE "ai_settings" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "preferred_provider" TEXT NOT NULL DEFAULT 'auto',
    "model" TEXT,
    "anthropic_key_enc" TEXT,
    "openai_key_enc" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ai_settings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ai_settings_user_id_key" ON "ai_settings"("user_id");
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
