'use client';

import { useEffect, useState } from 'react';

const SEEN_KEY = 'pulso.teams.lastSeen'; // localStorage: persiste entre sesiones
const SNAP_KEY = 'pulso.teams.visitSnapshot'; // sessionStorage: estable dentro de la sesión

interface Snapshot {
  firstVisit: boolean;
  newCount: number;
}

/**
 * Marca, de forma local y sin vigilancia, cuánto cambió desde la última visita.
 * Primera vez → orienta ("esto es el pulso"). Vuelta → "N novedades desde tu
 * última visita". Guarda solo un timestamp en localStorage de este equipo.
 *
 * El cálculo se congela por sesión (sessionStorage): así re-montajes y
 * navegaciones internas no resetean el conteo ni rompen la detección de
 * "primera vez" (incluido el doble-mount de React en desarrollo).
 */
export function LastVisitBadge({ activity }: { activity: string[] }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);

  useEffect(() => {
    const cached = sessionStorage.getItem(SNAP_KEY);
    if (cached) {
      setSnap(JSON.parse(cached) as Snapshot);
      return;
    }
    const prev = localStorage.getItem(SEEN_KEY);
    const prevTs = prev ? Number(prev) : null;
    const newCount = prevTs ? activity.filter((t) => Date.parse(t) > prevTs).length : 0;
    const computed: Snapshot = { firstVisit: !prevTs, newCount };
    setSnap(computed);
    sessionStorage.setItem(SNAP_KEY, JSON.stringify(computed));
    localStorage.setItem(SEEN_KEY, String(Date.now()));
  }, [activity]);

  if (!snap) return null;

  if (snap.firstVisit) {
    return (
      <p className="font-meta text-[11px] uppercase tracking-[0.16em] text-muted/80">
        ✦ Este es el pulso de tu organización · lo vas a encontrar acá cada vez que entres
      </p>
    );
  }
  if (snap.newCount > 0) {
    return (
      <p className="font-meta text-[11px] uppercase tracking-[0.16em] text-accent">
        ✦ {snap.newCount} {snap.newCount === 1 ? 'novedad' : 'novedades'} desde tu última visita
      </p>
    );
  }
  return <p className="font-meta text-[11px] uppercase tracking-[0.16em] text-muted/70">Sin novedades desde tu última visita</p>;
}
