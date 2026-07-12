-- Fixture sintético deliberadamente inválido sobre el esquema anterior a P1.
-- El usuario pertenece a A, pero aparece asignado al equipo de B con un rol de A.
INSERT INTO "Organization" ("id", "name", "slug") VALUES
  ('invalid-org-a', 'Organización inválida A', 'invalid-a'),
  ('invalid-org-b', 'Organización inválida B', 'invalid-b');

INSERT INTO "User" ("id", "email", "name", "passwordHash")
VALUES ('invalid-user', 'invalid-user@integration.invalid', 'Usuario sintético', 'not-a-real-password');

INSERT INTO "Role" ("id", "organizationId", "key", "name", "permissions", "isSystem")
VALUES ('invalid-role-a', 'invalid-org-a', 'MEMBER', 'Miembro A', '[]', true);

INSERT INTO "OrgMembership" ("id", "organizationId", "userId", "roleId")
VALUES ('invalid-org-membership', 'invalid-org-a', 'invalid-user', 'invalid-role-a');

INSERT INTO "Team" ("id", "organizationId", "name")
VALUES ('invalid-team-b', 'invalid-org-b', 'Equipo B');

INSERT INTO "TeamMembership" ("id", "teamId", "userId", "roleId")
VALUES ('invalid-team-membership', 'invalid-team-b', 'invalid-user', 'invalid-role-a');
