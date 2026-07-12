-- Dos identidades históricas que colisionan al normalizar case-insensitivamente.
INSERT INTO "User" ("id", "email", "name", "passwordHash") VALUES
  ('invalid-auth-user-a', 'Duplicate@integration.invalid', 'Duplicate A', 'not-a-real-password'),
  ('invalid-auth-user-b', 'duplicate@integration.invalid', 'Duplicate B', 'not-a-real-password');
