-- Product change: no Telegram bot, no SMS/OTP. Clients book as guests (secret manage link);
-- staff sign in with phone + password; staff invitations are secret links.

-- Data fix-ups before type/constraint changes.
UPDATE "appointments" SET "source" = 'ONLINE' WHERE "source" = 'TELEGRAM';
-- Phone-matched invitations can no longer be accepted safely (phones are unverified).
DELETE FROM "invitations" WHERE "accepted_at" IS NULL;

-- AlterEnum
BEGIN;
CREATE TYPE "AppointmentSource_new" AS ENUM ('ONLINE', 'MANUAL');
ALTER TABLE "public"."appointments" ALTER COLUMN "source" DROP DEFAULT;
ALTER TABLE "appointments" ALTER COLUMN "source" TYPE "AppointmentSource_new" USING ("source"::text::"AppointmentSource_new");
ALTER TYPE "AppointmentSource" RENAME TO "AppointmentSource_old";
ALTER TYPE "AppointmentSource_new" RENAME TO "AppointmentSource";
DROP TYPE "public"."AppointmentSource_old";
ALTER TABLE "appointments" ALTER COLUMN "source" SET DEFAULT 'ONLINE';
COMMIT;

-- DropForeignKey
ALTER TABLE "notification_jobs" DROP CONSTRAINT "notification_jobs_appointment_id_fkey";

-- DropForeignKey
ALTER TABLE "notification_jobs" DROP CONSTRAINT "notification_jobs_business_id_fkey";

-- DropForeignKey
ALTER TABLE "telegram_link_tokens" DROP CONSTRAINT "telegram_link_tokens_user_id_fkey";

-- DropIndex
DROP INDEX "invitations_phone_idx";

-- DropIndex
DROP INDEX "users_telegram_id_key";

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "manage_token_hash" TEXT;

-- AlterTable
ALTER TABLE "invitations" ADD COLUMN "token_hash" TEXT,
ALTER COLUMN "phone" DROP NOT NULL;
-- Accepted invitations keep their history with an unusable random hash.
UPDATE "invitations" SET "token_hash" = encode(sha256(gen_random_uuid()::text::bytea), 'hex') WHERE "token_hash" IS NULL;
ALTER TABLE "invitations" ALTER COLUMN "token_hash" SET NOT NULL;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "telegram_chat_id",
DROP COLUMN "telegram_id",
DROP COLUMN "telegram_username",
ADD COLUMN     "failed_login_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "locked_until" TIMESTAMPTZ(3),
ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "password_hash" TEXT;

-- DropTable
DROP TABLE "notification_jobs";

-- DropTable
DROP TABLE "otp_codes";

-- DropTable
DROP TABLE "telegram_link_tokens";

-- DropEnum
DROP TYPE "NotificationChannel";

-- DropEnum
DROP TYPE "NotificationStatus";

-- CreateIndex
CREATE UNIQUE INDEX "appointments_manage_token_hash_key" ON "appointments"("manage_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

