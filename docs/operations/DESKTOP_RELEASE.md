# Release de Pulso Desktop

## Candidato local 0.1.24 — 2026-07-13

Este artefacto es evidencia de empaquetado, no una release publicada:

- fuente: commit `f6bcbc3` de `codex/web-control-plane-hardening`;
- archivo local ignorado por Git:
  `apps/desktop/dist/Pulso Setup 0.1.24.exe`;
- tamaño: `102822959` bytes;
- SHA-256:
  `3b94a07855e71c8c1865f5d722c8bf54ce162622fd9010555720dc488470e18c`;
- firma Authenticode: `NotSigned`;
- publicación: no realizada.

El empaquetado NSIS terminó correctamente. Se inició el servidor Next contenido
en `win-unpacked` con `ELECTRON_RUN_AS_NODE=1` y un puerto aislado: health,
`/personal` y `/captura` respondieron 200; `/register` respondió 404. Los
artefactos empaquetados contienen las opciones `Con mi cuenta Pulso`,
`API key propia`, `IA local` y `Sin IA por ahora`, además de los estados de
conexión de Personal AI.

## Bloqueos antes de distribuir

1. Agregar un icono Windows de marca al repositorio y configurar
   `build.win.icon`. El candidato actual usa el icono genérico de Electron.
2. Obtener un certificado de firma de código para el titular/editor definitivo.
   No almacenar PFX, contraseña ni token de firma en Git.
3. Confirmar el nombre de editor y que `com.pulso.desktop` sea el App ID
   definitivo antes de comprar o emitir el certificado.
4. Ejecutar el smoke en un perfil o VM Windows limpio. El smoke debe incluir
   instalación, primer arranque, onboarding, carpeta Markdown, captura manual,
   BYOK cifrado, IA local, conexión por PKCE y desinstalación.
5. Configurar una allowlist mínima y probar una cuenta autorizada y otra fuera
   de la lista. La feature server-side permanece apagada hasta ese momento.
6. Revisar el destino del auto-updater. La configuración actual apunta a GitHub
   `valenziegenbein/pulso`; no publicar hasta confirmar que ése será el canal
   definitivo y que sus permisos son los esperados.

## Generación y firma

1. Partir de un worktree limpio y ejecutar el green gate completo.
2. Incrementar la versión sólo cuando el contenido del candidato sea final.
3. Configurar electron-builder con el icono versionado.
4. Proveer la credencial de firma mediante el mecanismo seguro elegido por el
   proveedor/certificado. La identidad privada nunca debe entrar al repositorio,
   logs ni artefactos de CI.
5. Ejecutar `pnpm --filter @pulso/desktop dist` y exigir que
   `Get-AuthenticodeSignature` devuelva `Valid` y el subject esperado.
6. Calcular SHA-256, conservar instalador y blockmap, e instalar esa misma copia
   en una VM limpia.
7. Publicar sólo después del smoke manual autorizado. Verificar que el archivo
   descargado tenga el mismo SHA-256 y la firma válida.

## Rollback de Desktop

- No reemplazar ni eliminar el instalador anterior hasta observar el nuevo.
- El canal de actualización debe apuntar a una versión firmada anterior si la
  nueva falla.
- Una regresión de UI o Personal se resuelve reinstalando la versión anterior;
  no borrar `%APPDATA%\Pulso` automáticamente.
- Antes de una migración local incompatible, crear y verificar una copia de
  `pulso.db` y de la carpeta Markdown seleccionada.
