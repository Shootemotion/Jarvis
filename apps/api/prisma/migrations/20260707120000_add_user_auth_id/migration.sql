-- Add Supabase auth user id mapping to users.
ALTER TABLE "users" ADD COLUMN "auth_id" TEXT;
CREATE UNIQUE INDEX "users_auth_id_key" ON "users"("auth_id");
