-- Fixture sintético para staging después de aplicar todas las migraciones.
INSERT INTO "Organization" ("id", "name", "slug")
VALUES ('staging-org', 'Organización sintética de staging', 'staging-synthetic');

INSERT INTO "User" ("id", "email", "normalizedEmail", "name", "passwordHash", "emailVerifiedAt", "updatedAt") VALUES
  ('staging-admin', 'staging-admin@integration.invalid', 'staging-admin@integration.invalid', 'Admin sintético', 'scrypt$000102030405060708090a0b0c0d0e0f$c283348fbe9c87c4034ebc5a6b68dfe9b9010edd762ec544225ea292aec86bac49d19282b77341afd7c3a8b16334d24c0e68116033b84d3504f9c1d1d548a70b', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('staging-member', 'staging-member@integration.invalid', 'staging-member@integration.invalid', 'Miembro sintético', 'scrypt$000102030405060708090a0b0c0d0e0f$c283348fbe9c87c4034ebc5a6b68dfe9b9010edd762ec544225ea292aec86bac49d19282b77341afd7c3a8b16334d24c0e68116033b84d3504f9c1d1d548a70b', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "Role" ("id", "organizationId", "key", "name", "permissions", "isSystem") VALUES
  ('staging-role-admin', 'staging-org', 'ORG_ADMIN', 'Admin', '[]', true),
  ('staging-role-member', 'staging-org', 'MEMBER', 'Miembro', '[]', true);

INSERT INTO "OrgMembership" ("id", "organizationId", "userId", "roleId") VALUES
  ('staging-om-admin', 'staging-org', 'staging-admin', 'staging-role-admin'),
  ('staging-om-member', 'staging-org', 'staging-member', 'staging-role-member');

INSERT INTO "Team" ("id", "organizationId", "name")
VALUES ('staging-team', 'staging-org', 'Equipo sintético');

INSERT INTO "TeamMembership" ("id", "organizationId", "teamId", "userId", "roleId")
VALUES ('staging-tm-member', 'staging-org', 'staging-team', 'staging-member', 'staging-role-member');

INSERT INTO "Task" (
  "id", "organizationId", "teamId", "title", "assigneeId", "createdById", "status", "updatedAt"
) VALUES (
  'staging-task', 'staging-org', 'staging-team', 'Tarea sintética', 'staging-member', 'staging-admin', 'TODO', CURRENT_TIMESTAMP
);

INSERT INTO "WorklogEntry" (
  "id", "organizationId", "authorId", "teamId", "taskId", "type", "status", "title", "content", "updatedAt"
) VALUES
  ('staging-draft', 'staging-org', 'staging-member', 'staging-team', 'staging-task', 'NOTE', 'DRAFT', 'Borrador sintético', 'Sin datos reales', CURRENT_TIMESTAMP),
  ('staging-published', 'staging-org', 'staging-member', 'staging-team', 'staging-task', 'PROGRESS', 'PUBLISHED', 'Publicado sintético', 'Sin datos reales', CURRENT_TIMESTAMP);
