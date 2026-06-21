# @pulso/desktop

Shell de escritorio de Pulso (Electron). No reimplementa la UI: abre ventanas
nativas que cargan el server Next (`@pulso/web`).

- **Main window** → `/` (panel principal)
- **Floating widget** → `/widget` (frameless · always-on-top · arrastrable · ✕)
- **System tray** → Abrir panel / Mostrar widget / Salir
- **Global shortcut** → `Ctrl+Shift+P` (mostrar/ocultar widget)

## Correr

Necesita el server Next corriendo (apunta a `PULSO_URL`, por defecto
`http://localhost:3000`):

```bash
# 1) build + server (en otra terminal)
pnpm --filter web build
pnpm --filter web start

# 2) shell de escritorio
pnpm --filter @pulso/desktop start
# o con otro server:  PULSO_URL=http://localhost:3001 pnpm --filter @pulso/desktop start
```

El shell espera a que el server responda antes de abrir las ventanas, así que el
orden de arranque no importa.

## Empaquetar a `.exe` (instalador NSIS)

```bash
# 1) build standalone de la web (genera apps/web/.next/standalone)
pnpm --filter web build
# 2) instalador  ->  apps/desktop/dist/Pulso Setup <version>.exe
pnpm --filter @pulso/desktop dist
#    (o sin instalador, carpeta ejecutable:  pnpm --filter @pulso/desktop dist:dir)
```

El instalador embebe el server Next standalone (con el motor de Prisma) en
`resources/server` y una **DB SQLite semilla** en `resources/db-template/pulso.db`.
Al ejecutarse, la app (empaquetada) **levanta ese server** en `127.0.0.1:41789`,
copia la DB semilla a `%APPDATA%\Pulso\pulso.db` (primer arranque) y abre las
ventanas. **100% autónomo: no necesita Docker ni Postgres.**

### Configuración del usuario

En el primer arranque la app crea:
- `%APPDATA%\Pulso\pulso.db` — copia de la DB semilla (datos demo). Editable/persistente.
- `%APPDATA%\Pulso\pulso.config.json` — `AUTH_SECRET`, `WORKLOG_ENCRYPTION_KEY`,
  `LLM_PROVIDER` (los secretos se generan solos). Opcional: agregá `DATABASE_URL`
  para apuntar a otra base; si no, usa el SQLite local.
- `%APPDATA%\Pulso\server.log` — logs del server embebido.

## Publicar una versión (auto-update)

Feed: **GitHub Releases** en `valenziegenbein/pulso` (repo público, solo releases —
el código fuente NO se sube). La app instalada chequea ese repo al arrancar y se
actualiza sola (electron-updater).

Para sacar una versión nueva (así los usuarios la reciben sin reinstalar):

```bash
# 1) si cambió la web:
pnpm --filter web build
# 2) subí la versión en apps/desktop/package.json (semver, ej: 0.1.2)
# 3) publicá (el token NO se commitea; va por env):
GH_TOKEN=<tu_token> pnpm --filter @pulso/desktop release
```

`release` empaqueta el instalador y crea el GitHub Release (tag `vX.Y.Z`) con
`latest.yml` + el `.exe`. Las apps instaladas lo detectan, lo bajan y ofrecen
reiniciar para aplicarlo. El menú de bandeja tiene **"Buscar actualizaciones"**.

> El token de publicación es un secreto: pasalo por `GH_TOKEN` en el momento, no
> lo guardes en el repo. Conseguilo en GitHub → Settings → Developer settings →
> Personal access tokens (scope `repo` / `public_repo`).

### Firma de código (pendiente)

Hoy se publica **sin firmar** → Windows SmartScreen muestra "editor desconocido"
en la primera instalación (el auto-update funciona igual: se verifica por sha512).
Con un certificado `.pfx`, configurar `CSC_LINK` + `CSC_KEY_PASSWORD` y quitar
`win.signAndEditExecutable: false`.

### Gotchas de Windows (ya resueltos en la config)

- **pnpm + standalone/electron-builder**: requieren node_modules plano →
  `node-linker=hoisted` en `.npmrc` (si no, EPERM al symlinkear).
- **Sin Developer Mode/admin**: `winCodeSign` no puede crear symlinks de macOS.
  Por eso `win.signAndEditExecutable: false` (no firmamos ni editamos el exe).
  Con certificado de firma, esto se reactiva.

### Actualizar la DB embebida (cuando cambia el schema)

La DB semilla se regenera desde el dev:

```bash
pnpm db:migrate && pnpm db:seed   # actualiza packages/database/prisma/dev.db
pnpm --filter @pulso/desktop dist # prepare-standalone.cjs la copia a db-template/
```

Para usuarios ya instalados con datos propios, una versión futura debería migrar
el `%APPDATA%\Pulso\pulso.db` existente (hoy solo se copia si no existe).

## Próximos pasos (no MVP)

- Migración del `pulso.db` del usuario al actualizar (hoy: copia solo si falta).
- Icono propio de la app (hoy usa el de Electron por defecto).
- Auto-update (`electron-updater`) y firma de código.
- Migración opcional a Tauri para binarios más chicos.
