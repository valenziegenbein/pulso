'use client';

import { useEffect, useState } from 'react';

type Team = { id: string; name: string };
type Source = { id: string; name: string; scope: string; teamId?: string | null; fileCount: number; chunkCount: number };
type BridgeResult<T> = { ok: true; data: T } | { ok: false; error?: string };
type Bridge = {
  isDesktop?: boolean;
  chooseFolder?: () => Promise<string | null>;
  knowledgeTargets?: () => Promise<BridgeResult<{ teams?: Team[]; sources?: Source[] }>>;
  deleteKnowledgeSource?: (sourceId: string) => Promise<BridgeResult<{ deleted?: boolean }>>;
  syncKnowledgeFolder?: (payload: {
    dir: string;
    scope: 'TEAM';
    teamId: string;
    sourceName: string;
  }) => Promise<BridgeResult<{ fileCount?: number; chunkCount?: number }>>;
};

function bridge(): Bridge | undefined {
  return typeof window !== 'undefined' ? (window as unknown as { pulso?: Bridge }).pulso : undefined;
}

export function TeamKnowledgeSync() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState('');
  const [sources, setSources] = useState<Source[]>([]);
  const [consent, setConsent] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const shell = bridge();
    if (!shell?.isDesktop || !shell.knowledgeTargets) return;
    void shell.knowledgeTargets().then((result) => {
      if (!result.ok) return;
      const available = result.data.teams ?? [];
      setTeams(available);
      setSources(result.data.sources ?? []);
      setTeamId((current) => current || available[0]?.id || '');
    });
  }, []);

  if (!bridge()?.isDesktop || (teams.length === 0 && sources.length === 0)) return null;

  async function sync() {
    const shell = bridge();
    if (!shell?.chooseFolder || !shell.syncKnowledgeFolder || !teamId || !consent) return;
    const dir = await shell.chooseFolder();
    if (!dir) return;
    const team = teams.find((candidate) => candidate.id === teamId);
    setSyncing(true);
    setMessage(null);
    try {
      const result = await shell.syncKnowledgeFolder({
        dir,
        scope: 'TEAM',
        teamId,
        sourceName: team?.name ?? 'Documentación del equipo',
      });
      setMessage(result.ok
        ? `Listo · ${result.data.fileCount ?? 0} archivos · ${result.data.chunkCount ?? 0} fragmentos disponibles para el equipo.`
        : `No se pudo sincronizar (${result.error ?? 'error de red'}).`);
    } catch {
      setMessage('No se pudo sincronizar.');
    } finally {
      setSyncing(false);
    }
  }

  async function remove(sourceId: string) {
    const shell = bridge();
    if (!shell?.deleteKnowledgeSource) return;
    const result = await shell.deleteKnowledgeSource(sourceId);
    if (result.ok) {
      setSources((current) => current.filter((source) => source.id !== sourceId));
      setMessage('La copia cloud y su índice fueron eliminados. La carpeta local no se modificó.');
    } else {
      setMessage('No se pudo eliminar la copia cloud.');
    }
  }

  return (
    <div className="mb-10 rounded-2xl border border-border bg-surface/40 p-5">
      <h2 className="font-display text-xl">Documentación sincronizada con Pulso Cloud</h2>
      {teams.length > 0 && <p className="mt-1 text-sm text-muted">
        Elegí una carpeta Markdown/Obsidian y un equipo. El renderer remoto nunca recibe acceso al filesystem: Electron
        lee únicamente la carpeta elegida y envía fragmentos al endpoint fijo de Pulso Cloud.
      </p>}
      {teams.length > 0 && <label className="mt-4 block">
        <span className="font-meta text-[10px] uppercase tracking-[0.18em] text-muted">Equipo</span>
        <select
          value={teamId}
          onChange={(event) => setTeamId(event.target.value)}
          className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
        >
          {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
        </select>
      </label>}
      {teams.length > 0 && <label className="mt-3 flex items-start gap-2 text-sm text-muted">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
        />
        <span>Confirmo que esta documentación puede compartirse con integrantes autorizados del equipo.</span>
      </label>}
      {teams.length > 0 && <button
        onClick={() => void sync()}
        disabled={!consent || !teamId || syncing}
        className="mt-3 rounded-full bg-accent px-5 py-2 text-sm font-medium text-bg transition hover:brightness-110 disabled:opacity-40"
      >
        {syncing ? 'Sincronizando…' : 'Elegir carpeta y sincronizar'}
      </button>}
      {message && <p className="mt-3 text-sm text-muted">{message}</p>}
      {sources.length > 0 && (
        <div className="mt-5 border-t border-border/60 pt-4">
          <p className="font-meta text-[10px] uppercase tracking-[0.18em] text-muted">Copias cloud propias</p>
          <ul className="mt-2 space-y-2">
            {sources.map((source) => (
              <li key={source.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/60 px-3 py-2 text-sm">
                <span className="min-w-0 truncate">
                  {source.name} · {source.fileCount} archivos · {source.chunkCount} fragmentos
                </span>
                <button onClick={() => void remove(source.id)} className="shrink-0 text-xs text-[#d98a5e] hover:underline">
                  Eliminar cloud
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
