import { useEffect, useRef } from 'react';
import { getOrCreatePlayerId } from '../lib/player';
import {
  HEARTBEAT_MS,
  heartbeat,
  markDisconnected,
  reconcileRoom,
  subscribeRoom,
} from '../multiplayer/rooms';

/**
 * Keeps the local player marked online, runs room reconciliation
 * (host transfer, forfeits, countdown→playing), and marks disconnect
 * on tab hide / unload.
 */
export function usePartyLifecycle(code: string | null) {
  const playerId = getOrCreatePlayerId();
  const codeRef = useRef(code);
  codeRef.current = code;

  useEffect(() => {
    if (!code) return;

    let stopped = false;
    const beat = () => {
      if (stopped || document.visibilityState === 'hidden') return;
      heartbeat(code, playerId).catch(() => undefined);
    };
    beat();
    const hb = window.setInterval(beat, HEARTBEAT_MS);

    const reconcile = () => {
      if (stopped) return;
      reconcileRoom(code, playerId).catch(() => undefined);
    };
    reconcile();
    const unsub = subscribeRoom(code, () => {
      // Debounce via microtask coalescing
      window.setTimeout(reconcile, 50);
    });
    const rc = window.setInterval(reconcile, 2500);

    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        markDisconnected(code, playerId).catch(() => undefined);
      } else {
        beat();
        reconcile();
      }
    };
    const onHide = () => {
      markDisconnected(code, playerId).catch(() => undefined);
    };

    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onHide);

    return () => {
      stopped = true;
      window.clearInterval(hb);
      window.clearInterval(rc);
      unsub();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onHide);
    };
  }, [code, playerId]);
}
