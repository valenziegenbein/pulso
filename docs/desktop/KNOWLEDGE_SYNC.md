# Carpetas locales, embeddings y Pulso Cloud

## Resultado

Desktop conserva la carpeta Markdown/Obsidian como fuente de verdad y ofrece dos índices independientes:

- **índice local**: BM25 más embeddings guardados en `%APPDATA%\Pulso\embeddings-cache`; se usa en Personal con IA local, BYOK o IA administrada;
- **índice cloud**: copia explícita y revocable de fragmentos Markdown, ligada a una organización y a un proyecto Personal o equipo Teams.

La IA sólo propone borradores. La sincronización documental no publica entradas ni cambia archivos locales.

## Flujo de consentimiento

1. La persona abre Proyecto → Archivos o Ajustes → Documentación sincronizada.
2. Selecciona proyecto/equipo y confirma que puede cargar la documentación.
3. Electron abre el selector nativo de carpetas. Una ruta escrita por el renderer no alcanza.
4. El proceso principal lee únicamente `*.md`; ignora `.git`, `.obsidian`, `.trash`, `.logseq`, `node_modules` y carpetas ocultas.
5. Los documentos se parten por encabezados y párrafos. No se suben binarios.
6. El servidor genera embeddings `RETRIEVAL_DOCUMENT`, cifra el texto con AES-256-GCM y persiste metadatos/vectores con alcance tenant.
7. Al proponer una entrada, se genera un embedding `RETRIEVAL_QUERY`, se recuperan los fragmentos autorizados y se agrega contexto acotado al prompt.

La pantalla de Ajustes permite eliminar la copia cloud y su índice. Esa operación nunca elimina la carpeta local.

## Aislamiento

- Personal: `organizationId + ownerId + clientProjectId`.
- Teams: `organizationId + teamId`; sólo miembros con acceso al equipo pueden sincronizar o consultar.
- Una fuente no puede cambiar de proyecto/equipo después de creada.
- Los IDs de organización y usuario se derivan de la sesión Desktop; no se aceptan desde el cliente.
- El preload remoto de Teams no expone filesystem, importación, embeddings ni sincronización. La operación privilegiada vive en el renderer local de Personal y usa endpoints remotos fijos.

## Modelo administrado

Chat y embeddings son capacidades separadas:

```env
PULSO_PERSONAL_ACCOUNT_AI_MODEL=gemini-3.1-flash-lite
PULSO_PERSONAL_ACCOUNT_AI_EMBEDDING_MODEL=gemini-embedding-001
```

Pulso usa el endpoint nativo `batchEmbedContents`, dimensión 768 y tipos de tarea distintos para documento y consulta. Cambiar el modelo requiere reindexar; el cache local usa una clave versionada.

## Despliegue

La migración `20260714040000_knowledge_sources` es aditiva. El orden obligatorio sigue siendo:

1. backup cifrado y checksum;
2. restore test aislado;
3. `prisma migrate deploy` como job previo;
4. smoke de readiness y autenticación Desktop;
5. promover imagen inmutable;
6. verificar sincronización con datos sintéticos;
7. rollback de imagen; restaurar DB sólo ante una falla de datos confirmada.

No usar `prisma db push` ni reseedear producción.

## Estado operativo

Promovido el 2026-07-14 con commit
`b7056c14e358900413bcdb129b2c89382dcf2c7d` y digest
`docker.io/valenziegenbein/pulso-app@sha256:6452aef06ec2edcbaffc16b0c6eb514102ce78b804c5b1354f522b9d854325ae`.
La migración quedó aplicada y sin pendientes. El primer smoke con una identidad
real debe usar documentación no sensible o sintética y confirmar desde Desktop
que sincronizar, recuperar contexto y revocar la copia funcionan de extremo a
extremo.
