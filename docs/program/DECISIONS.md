# Registro de decisiones

## D-001 — Programa por fases y permisos crecientes

- Fecha: 2026-07-11
- Contexto: llevar Pulso a operación comercial sin mezclar cambios ni permisos.
- Decisión: ejecutar una fase por vez y detenerse en cada gate L0–L5.
- Alternativas: ejecutar el roadmap completo de una vez; descartada por riesgo.
- Consecuencias: P0.5 permanece abierta aunque el trabajo local esté verde.
- Reversibilidad: alta; es una regla de proceso.

## D-002 — README ajeno fuera del índice

- Fecha: 2026-07-11
- Contexto: `README.md` aparece eliminado y `README pulso.md` contiene una copia idéntica.
- Decisión: preservar ambos estados sin modificarlos ni stagearlos; prohibir `git add -A`.
- Alternativas: restaurar o confirmar el rename sin autorización; descartadas.
- Consecuencias: los commits requieren pathspecs explícitos.
- Reversibilidad: total.

## D-003 — Anthropic no implementa embeddings

- Fecha: 2026-07-11
- Contexto: el test accedía a `embed` sobre el tipo concreto `AnthropicProvider`.
- Decisión: probar la capacidad a través del contrato opcional `LLMProvider`.
- Alternativas: añadir un método ficticio; rechazada porque Anthropic no ofrece esa capacidad aquí.
- Consecuencias: typecheck global verde sin mentir sobre capacidades.
- Reversibilidad: alta.

## D-004 — PostgreSQL efímero con guardas estrictas

- Fecha: 2026-07-11
- Contexto: las pruebas críticas no podían depender sólo de mocks.
- Decisión: PostgreSQL 16 en tmpfs, usuario/base sintéticos, host local,
  `TEST_DATABASE_URL === DATABASE_URL` y marcador explícito.
- Alternativas: usar una DB compartida o remota; rechazadas.
- Consecuencias: la suite no puede apuntar accidentalmente a producción.
- Reversibilidad: alta.

## D-005 — Migración como job previo

- Fecha: 2026-07-11
- Contexto: migrar durante el arranque mezcla fallo de schema y disponibilidad.
- Decisión: retirar migraciones del entrypoint y usar un servicio `migrate` explícito.
- Alternativas: conservar `migrate deploy` en cada arranque; rechazada.
- Consecuencias: una migración fallida bloquea promoción sin reemplazar la app actual.
- Reversibilidad: alta.

## D-006 — Backup cifrado antes de salir del host

- Fecha: 2026-07-11
- Contexto: se necesita copia externa sin exponer datos o secretos.
- Decisión: `pg_dump` custom comprimido, age, manifiesto, SHA-256 y rclone con aprobación explícita.
- Alternativas: SQL plano o cifrado server-side del proveedor; insuficientes por sí solos.
- Consecuencias: se necesita una clave pública y custodiar la privada fuera del VPS.
- Reversibilidad: alta.

## D-007 — Artefactos e imágenes inmutables

- Fecha: 2026-07-11
- Contexto: rollback exige identificar exactamente lo promovido.
- Decisión: imágenes base por digest real; imagen Pulso por Git SHA y digest de registry.
- Alternativas: tags flotantes o build directo en VPS; rechazadas.
- Consecuencias: el digest Pulso queda bloqueado hasta commits y registry autorizados.
- Reversibilidad: media; actualizar digests requiere gate completo.

## D-008 — Sin RLS automático

- Fecha: 2026-07-11
- Contexto: el aislamiento actual es lógico y se evalúan constraints adicionales.
- Decisión: no introducir RLS sin una decisión y plan de migración separados.
- Alternativas: activar RLS inmediatamente; rechazada por impacto operativo no evaluado.
- Consecuencias: authz central y tests DB-backed siguen siendo la defensa principal.
- Reversibilidad: no aplica; decisión pendiente de futura revisión.

## D-009 — Versionado atómico sin incluir cambios ajenos

- Fecha: 2026-07-11
- Contexto: P0/P0.5 ocupaba varias áreas y coexistía con un rename ajeno de README.
- Decisión: crear ocho commits operativos con pathspecs explícitos y un commit
  documental; verificar el índice antes de cada commit y no usar `git add -A`.
- Alternativas: un único commit o stage global; rechazadas por auditabilidad y riesgo.
- Consecuencias: el hardening puede revisarse/revertirse por dominio; los README
  permanecen exactamente como estaban y fuera del historial.
- Reversibilidad: alta mediante revert de commits individuales.

## D-010 — Disco F como destino temporal fuera del VPS

- Fecha: 2026-07-11
- Contexto: todavía no hay segundo servidor ni proveedor externo definido.
- Decisión: reservar `F:\Pulso-backups` para bundles previamente cifrados y
  verificados; nunca almacenar dumps planos.
- Alternativas: dejar la única copia en el VPS o contratar un recurso sin
  autorización; ambas rechazadas.
- Consecuencias: mejora la separación respecto del VPS, pero no protege frente
  a pérdida del equipo/disco local y no completa por sí sola P0.5-G3.
- Reversibilidad: total; los bundles podrán copiarse a un destino definitivo.

## D-011 — Registry privado y promoción exclusiva por digest

- Fecha: 2026-07-11
- Contexto: P0.5 requiere un artefacto reproducible y recuperable antes de
  staging.
- Decisión: usar `docker.io/valenziegenbein/pulso-app` privado; publicar sólo el
  tag con Git SHA completo y promover siempre el digest remoto verificado.
- Alternativas: `latest`, tag corto o build directo en servidores; rechazadas.
- Consecuencias: el tag de Docker Hub puede ser mutable, pero staging y
  producción deben referenciar exclusivamente el digest registrado.
- Reversibilidad: media; una nueva versión requiere otro SHA, build, gate y
  digest, sin retargetear despliegues existentes.

## D-012 — Reemplazar artefactos fallidos, nunca retargetearlos

- Fecha: 2026-07-11
- Contexto: el primer digest registrado inició Next standalone ligado al
  hostname del contenedor y falló healthcheck por loopback.
- Decisión: conservar el artefacto fallido como evidencia, corregir mediante un
  nuevo commit y publicar un tag/digest nuevos; promover sólo el digest verde.
- Alternativas: mover el tag anterior o relajar el healthcheck; rechazadas por
  pérdida de trazabilidad y por ocultar una incompatibilidad real.
- Consecuencias: staging y producción usan
  `sha256:ccb32ed56d8f9d381675196de7c9a342b67f9d3e4d58ef82fdc177b6d2bc6ab6`.
- Reversibilidad: alta; cada digest permanece independiente y auditable.

## D-013 — Producción sin credencial de registry en el VPS

- Fecha: 2026-07-11
- Contexto: el repositorio Docker Hub es privado y todavía no existe token
  productivo read-only autorizado.
- Decisión: transportar la candidata mediante `docker save`, checksum y copia
  controlada; cargarla por image ID igual al digest remoto y usar
  `pull_policy: never`.
- Alternativas: token personal/write en VPS o build productivo; rechazadas por
  exceso de privilegios y falta de reproducibilidad.
- Consecuencias: el VPS no almacena credenciales Docker Hub; la recuperación
  depende del archivo verificado en `F:` hasta crear un pull token read-only.
- Reversibilidad: alta; un token read-only separado puede incorporarse después.
