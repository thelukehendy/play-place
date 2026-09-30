import { useEffect } from 'react';
import { getOrCreatePlayerId } from '../lib/player';
import {
  HEARTBEAT_MS,
  heartbeat,
  markDisconnected,
  reconcileRoom,
  subscribeRoom,
} from '../multiplayer/rooms';

/** Only treat a long background as a hard disconnect (iPhone lock/switch is normal). */
const HIDDEN_DISCONNECT_MS = 75_000;

/**
 * Keeps the local player marked online, runs room reconciliation
 * (host transfer, forfeits, countdown→playing).
 *
 * Soft backgrounding: brief lock/app-switch does NOT mark disconnected —
 * heartbeats simply pause and lastSeen goes stale. Hard disconnect only on
 * pagehide (tab close) or after a long hidden stretch.
 */
export function usePartyLifecycle(code: string | null) {
  const playerId = getOrCreatePlayerId();

  useEffect(() => {
    if (!code) return;

    let stopped = false;
    let hiddenTimer: number | null = null;

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
      window.setTimeout(reconcile, 50);
    });
    const rc = window.setInterval(reconcile, 2500);

    const clearHiddenTimer = () => {
      if (hiddenTimer != null) {
        window.clearTimeout(hiddenTimer);
        hiddenTimer = null;
      }
    };

    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        clearHiddenTimer();
        // Soft: do not flip connected:false — iPhone lock is common.
        hiddenTimer = window.setTimeout(() => {
          markDisconnected(code, playerId).catch(() => undefined);
        }, HIDDEN_DISCONNECT_MS);
      } else {
        clearHiddenTimer();
        beat();
        reconcile();
      }
    };

    const onHide = () => {
      // Real navigation/tab close — mark away promptly.
      markDisconnected(code, playerId).catch(() => undefined);
    };

    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onHide);

    return () => {
      stopped = true;
      clearHiddenTimer();
      window.clearInterval(hb);
      window.clearInterval(rc);
      unsub();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onHide);
    };
  }, [code, playerId]);
}
