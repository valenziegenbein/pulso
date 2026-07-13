# Release de Pulso Desktop

## Candidato local 0.1.26 — 2026-07-13

Este artefacto corrige la Web embebida sin publicar una release:

- archivo local ignorado por Git:
  `apps/desktop/dist/Pulso Setup 0.1.26.exe`;
- tamaño: `103171688` bytes;
- SHA-256:
  `c5ae393c71afeec33c3361f746ca7bb15371f2e714a77d4e8c6a8204ff5d9d15`;
- versión de producto del ejecutable: `0.1.26.0`;
- firma Authenticode: `NotSigned`;
- publicación: no realizada.

### Corrección de estilos

El candidato 0.1.25 servía correctamente sus dos hojas de estilo, pero la hoja
principal medía sólo `7136` bytes y no contenía utilidades Tailwind usadas por
la interfaz (`flex`, `grid`, `p-6`, `rounded-2xl`). Por eso el fondo y las
fuentes globales aparecían, mientras el layout quedaba como HTML sin estilos.

La configuración Tailwind ahora usa una ruta de contenido absoluta y PostCSS
recibe esa configuración explícitamente. El empaquetado Desktop elimina sólo
el build `.next`, recompila siempre la Web y aborta si el CSS generado no
contiene las utilidades críticas. También reemplaza los directorios `static` y
`public` del standalone para que no sobrevivan assets de un build anterior.

Evidencia del artefacto 0.1.26:

- CSS principal empaquetado: `22464` bytes;
- `/welcome`, `/personal` y `/captura`: HTTP `200`, título `Pulso`;
- ambos CSS: HTTP `200` desde el server contenido en `win-unpacked`;
- `flex`, `grid`, `p-6` y `rounded-2xl`: presentes en el CSS servido;
- instalación silenciosa aislada: código `0`;
- smoke de `/personal` desde la copia instalada: HTTP `200` con las cuatro
  utilidades presentes;
- desinstalación silenciosa: código `0`; carpeta temporal eliminada.

## Candidato local 0.1.25 — 2026-07-13

Este artefacto es evidencia de empaquetado, no una release publicada:

- archivo local ignorado por Git:
  `apps/desktop/dist/Pulso Setup 0.1.25.exe`;
- tamaño: `103169816` bytes;
- SHA-256:
  `aad9c55674bee200a756f8a86424438d75e4e7c3f7c9caf5e5c6fc74276f036a`;
- firma Authenticode: `NotSigned` (sin cambios respecto a 0.1.24; pendiente
  decisión de proveedor de firma, ver más abajo);
- publicación: no realizada.

Cambios respecto a 0.1.24:

- se agregó el icono de marca (`build/icon.ico`, estrella dorada `#d6b270`
  sobre fondo `#11100f`) al ejecutable empaquetado, al instalador NSIS y al
  desinstalador — resuelve el bloqueo #1 del candidato anterior;
- se removió `win.signAndEditExecutable: false` de la configuración de
  electron-builder. Esa flag desactivaba por completo el paso de rcedit que
  graba icono/versión en `Pulso.exe` (no solo la firma); sin certificado,
  `sign()` sigue saltándose limpiamente ("no signing info identified, signing
  is skipped"), así que quitarla no reabre ningún problema de firma.

Verificación del icono (lectura directa del recurso PE vía `ExtractIconEx` +
API de shell `SHGetFileInfo`, ambas coincidentes): fondo RGB(17,16,15),
estrella RGB(214,178,112) en `Pulso.exe`, en el instalador y en la copia
instalada.

Smoke de instalación/desinstalación (silencioso, `/S` + `/D=<ruta>`, carpeta
aislada fuera de cualquier instalación real):

- instalación: código de salida `0`, `Pulso.exe` presente con el icono de
  marca correcto;
- desinstalación: código de salida `0`, la carpeta de instalación quedó vacía
  (el uninstaller NSIS no borra su propio directorio padre; comportamiento
  esperado) y se limpió manualmente después.

Nota técnica para futuros builds: si vuelve a fallar la descarga/extracción
de `winCodeSign-*.7z` durante `signAndEditResources` con un error de symlink
("Se necesitan privilegios de administrador para esta operación"), correr
`npm run dist` desde una terminal elevada (Ejecutar como administrador). Es
un requisito de `SeCreateSymbolicLinkPrivilege` para extraer los symlinks de
macOS que trae ese paquete; con Modo Desarrollador activo alcanza sin
elevar, pero ese cambio requiere cerrar sesión para tomar efecto en el token
actual.

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

1. ~~Agregar un icono Windows de marca al repositorio y configurar
   `build.win.icon`.~~ Resuelto en el candidato 0.1.25 (ver arriba).
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
