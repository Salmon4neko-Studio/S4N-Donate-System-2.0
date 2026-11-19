-- Retire official.tts. Encrypted settings cascade with the installation row.
DELETE FROM "PluginInstallation" WHERE id = 'official.tts';
