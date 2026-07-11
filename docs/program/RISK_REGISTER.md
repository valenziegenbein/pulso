# Registro de riesgos

| ID | Descripción | Severidad | Probabilidad | Mitigación | Responsable | Estado |
| --- | --- | --- | --- | --- | --- | --- |
| R-001 | Backup y servidor comparten dominio de fallo | Crítica | Media | Bundle cifrado y restaurable en `F:`; añadir segundo destino offsite | Titular + SRE | Mitigado temporalmente; falta offsite duradero |
| R-002 | Hardening local no versionado | Alta | Media | Commits atómicos con pathspec y gate posterior | Principal Engineer | Cerrado localmente; 8 commits + docs |
| R-003 | Historial `_prisma_migrations` productivo no contrastado | Alta | Media | Inspección read-only autorizada y comparación con repo | SRE | Cerrado; nombres, checksums y estados coinciden |
| R-004 | No existe staging validado con la imagen candidata | Alta | Media | Promover digest exacto y ejecutar smokes | SRE | Cerrado; staging efímero verde por digest |
| R-005 | Cambio ajeno de README puede entrar por accidente | Media | Media | Índice vacío, prohibir `git add -A`, revisar cached diff | Principal Engineer | Mitigado, no cerrado |
| R-006 | Backup/restore age no probado end-to-end | Alta | Media | Ensayo con clave/destino autorizados y DB aislada | SRE | Cerrado; restore PostgreSQL 16 verificado |
| R-007 | Aislamiento multi-tenant no tiene todas las relaciones compuestas en DB | Alta | Baja/Media | Evaluar constraints aditivas en P1, sin migración automática | Security/DB | Abierto |
| R-008 | Auth actual no es persistida/revocable para uso comercial | Alta | Media | Diseñar y aprobar P2 antes de abrir registro | Security | Abierto |
| R-009 | Registro/Personal podrían reabrirse por cambio de proxy | Alta | Baja | Feature flags fail-closed + Caddy versionado + safety check | Security/SRE | Mitigado |
| R-010 | Desktop no tiene release firmada de este hardening | Media | Media | Firma, VM smoke y release sólo con L5 específico | Desktop owner | Abierto |
| R-011 | Documentación histórica del repo mezcla SQLite/Desktop y PostgreSQL/server | Media | Media | Actualización coordinada sin reescribir instrucciones de otra rama | Principal + Desktop owner | Abierto |
| R-012 | Instalación apt del Dockerfile depende del snapshot actual de Debian | Media | Baja | Evaluar pin/snapshot de paquetes en un commit de reproducibilidad | SRE | Abierto |
| R-013 | Logs de tests muestran errores Prisma esperados de constraints | Baja | Alta | Mantener aserciones explícitas; no confundirlos con fallos del gate | Engineering | Aceptado |
| R-014 | El disco F no es un destino offsite duradero | Alta | Media | Mantener cifrado, verificar restore y añadir segundo servidor/proveedor | Titular | Abierto, temporalmente aceptado |
| R-015 | El tag SHA de Docker Hub es mutable por configuración del repositorio | Alta | Baja | Promover y hacer rollback sólo por digest; nunca por tag ni `latest` | SRE | Mitigado por política y evidencia de digest |
| R-016 | Next standalone queda ligado al hostname y falla healthcheck loopback | Crítica | Alta | Forzar `HOSTNAME=0.0.0.0`, test runtime, nuevo SHA/digest y repetir staging | Engineering + SRE | Cerrado; health y smoke verdes con nuevo digest |

## Riesgos cerrados localmente

- Error global de typing `AnthropicProvider.embed`.
- Ausencia de PostgreSQL real para tests críticos.
- Falta de detección local de drift.
- Seed productivo no bloqueado.
- Migraciones como efecto secundario del arranque normal.
- Healthcheck sin dependencia DB.
- Caddy versionado sin bloqueos defensivos.
- Hardening sin commits atómicos.
