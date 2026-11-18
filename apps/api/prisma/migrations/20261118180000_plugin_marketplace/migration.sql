-- Marketplace columns. Existing rows stay installed and keep their settings.
ALTER TABLE "PluginInstallation" ADD COLUMN "installed" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "PluginInstallation" ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PluginInstallation" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'official';
ALTER TABLE "PluginInstallation" ADD COLUMN "sha256" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PluginInstallation" ADD COLUMN "previousVersion" TEXT;
ALTER TABLE "PluginInstallation" ADD COLUMN "previousSha256" TEXT;
ALTER TABLE "PluginInstallation" ADD COLUMN "permissions" JSONB NOT NULL DEFAULT '[]';
