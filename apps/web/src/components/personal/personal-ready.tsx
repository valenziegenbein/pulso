'use client';

import { useEffect } from 'react';

/** Avisa al shell de escritorio que el modo personal está listo (onboarded), para
 *  que abra el widget flotante. En el navegador no hace nada. */
export function PersonalReady() {
  useEffect(() => {
    (window as unknown as { pulso?: { personalReady?: () => void } }).pulso?.personalReady?.();
  }, []);
  return null;
}
