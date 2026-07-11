-- Fixture completamente sintético sobre el esquema de la migración inicial.
INSERT INTO "Organization" ("id", "name", "slug")
VALUES ('upgrade-org', 'Organización sintética de upgrade', 'upgrade-synthetic');

INSERT INTO "User" ("id", "email", "name", "passwordHash") VALUES
  ('upgrade-admin', 'upgrade-admin@integration.invalid', 'Admin sintético', 'not-a-real-password'),
  ('upgrade-member', 'upgrade-member@integration.invalid', 'Miembro sintético', 'not-a-real-password');

INSERT INTO "Role" ("id", "organizationId", "key", "name", "permissions", "isSystem") VALUES
  ('upgrade-role-admin', 'upgrade-org', 'ORG_ADMIN', 'Admin', '[]', true),
  ('upgrade-role-member', 'upgrade-org', 'MEMBER', 'Miembro', '[]', true);

INSERT INTO "OrgMembership" ("id", "organizationId", "userId", "roleId") VALUES
  ('upgrade-om-admin', 'upgrade-org', 'upgrade-admin', 'upgrade-role-admin'),
  ('upgrade-om-member', 'upgrade-org', 'upgrade-member', 'upgrade-role-member');

INSERT INTO "Team" ("id", "organizationId", "name")
VALUES ('upgrade-team', 'upgrade-org', 'Equipo sintético');

INSERT INTO "TeamMembership" ("id", "teamId", "userId", "roleId")
VALUES ('upgrade-tm-member', 'upgrade-team', 'upgrade-member', 'upgrade-role-member');

INSERT INTO "Task" (
  "id", "organizationId", "teamId", "title", "assigneeId", "createdById", "status", "updatedAt"
) VALUES (
  'upgrade-task', 'upgrade-org', 'upgrade-team', 'Tarea sintética', 'upgrade-member', 'upgrade-admin', 'TODO', CURRENT_TIMESTAMP
);

INSERT INTO "WorklogEntry" (
  "id", "organizationId", "authorId", "teamId", "taskId", "type", "status", "title", "content", "updatedAt"
) VALUES
  ('upgrade-draft', 'upgrade-org', 'upgrade-member', 'upgrade-team', 'upgrade-task', 'NOTE', 'DRAFT', 'Borrador sintético', 'Sin datos reales', CURRENT_TIMESTAMP),
  ('upgrade-published', 'upgrade-org', 'upgrade-member', 'upgrade-team', 'upgrade-task', 'PROGRESS', 'PUBLISHED', 'Publicado sintético', 'Sin datos reales', CURRENT_TIMESTAMP);
