-- Fixture sintético para staging después de aplicar todas las migraciones.
INSERT INTO "Organization" ("id", "name", "slug")
VALUES ('staging-org', 'Organización sintética de staging', 'staging-synthetic');

INSERT INTO "User" ("id", "email", "normalizedEmail", "name", "passwordHash", "emailVerifiedAt", "updatedAt") VALUES
  ('staging-admin', 'staging-admin@integration.invalid', 'staging-admin@integration.invalid', 'Admin sintético', 'not-a-real-password', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('staging-member', 'staging-member@integration.invalid', 'staging-member@integration.invalid', 'Miembro sintético', 'not-a-real-password', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

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
