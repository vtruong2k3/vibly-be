-- Migration: admin-totp-quarantine-report-audit
-- Adds TOTP 2FA, media quarantine lifecycle, report severity, and audit reason

-- 1. Add TOTP fields to users table
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "totp_secret"     TEXT,
  ADD COLUMN IF NOT EXISTS "totp_enabled"    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "totp_verified_at" TIMESTAMPTZ(6);

-- 2. Create admin_totp_backup_codes table
CREATE TABLE IF NOT EXISTS "admin_totp_backup_codes" (
  "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
  "user_id"    UUID         NOT NULL,
  "code_hash"  TEXT         NOT NULL,
  "used_at"    TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

  CONSTRAINT "admin_totp_backup_codes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "admin_totp_backup_codes_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "admin_totp_backup_codes_user_id_idx"
  ON "admin_totp_backup_codes"("user_id");

-- 3. Add MediaStorageStatus enum
DO $$ BEGIN
  CREATE TYPE "MediaStorageStatus" AS ENUM ('ACTIVE', 'QUARANTINED', 'PURGED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. Add media quarantine lifecycle fields to media_assets
ALTER TABLE "media_assets"
  ADD COLUMN IF NOT EXISTS "storage_status"      "MediaStorageStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS "quarantined_at"      TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "purge_scheduled_at"  TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "purged_at"           TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "quarantine_reason"   TEXT,
  ADD COLUMN IF NOT EXISTS "restored_at"         TIMESTAMPTZ(6);

CREATE INDEX IF NOT EXISTS "media_assets_storage_status_purge_idx"
  ON "media_assets"("storage_status", "purge_scheduled_at");

-- 5. Add ReportSeverity enum
DO $$ BEGIN
  CREATE TYPE "ReportSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 6. Add admin moderation fields to reports
ALTER TABLE "reports"
  ADD COLUMN IF NOT EXISTS "severity"             "ReportSeverity" NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN IF NOT EXISTS "moderator_id"         UUID,
  ADD COLUMN IF NOT EXISTS "resolved_at"          TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "resolved_by_user_id"  UUID,
  ADD COLUMN IF NOT EXISTS "resolve_note"         TEXT;

ALTER TABLE "reports"
  ADD CONSTRAINT "reports_moderator_id_fkey"
    FOREIGN KEY ("moderator_id") REFERENCES "users"("id")
    ON DELETE SET NULL
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "reports"
  ADD CONSTRAINT "reports_resolved_by_user_id_fkey"
    FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id")
    ON DELETE SET NULL
    DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX IF NOT EXISTS "reports_severity_status_idx"
  ON "reports"("severity", "status");

-- 7. Add reason field to admin_audit_logs
ALTER TABLE "admin_audit_logs"
  ADD COLUMN IF NOT EXISTS "reason" VARCHAR(500);

CREATE INDEX IF NOT EXISTS "admin_audit_logs_action_created_at_idx"
  ON "admin_audit_logs"("action", "created_at");

-- 8. Add BANNED to UserStatus enum
DO $$ BEGIN
  ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'BANNED';
EXCEPTION WHEN others THEN NULL;
END $$;
