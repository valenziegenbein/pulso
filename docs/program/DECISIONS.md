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
