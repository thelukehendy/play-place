import { useEffect, useRef } from 'react';

type WakeLockSentinel = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: 'release', fn: () => void) => void;
};

/**
 * Request a screen wake lock while `active` (live matches).
 * Best-effort — silently no-ops when unsupported (many desktop browsers).
 */
export function useWakeLock(active: boolean) {
  const lockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active) {
      void lockRef.current?.release().catch(() => undefined);
      lockRef.current = null;
      return;
    }

    let cancelled = false;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinel> };
    };

    const acquire = async () => {
      if (!nav.wakeLock || document.visibilityState !== 'visible') return;
      try {
        const lock = await nav.wakeLock.request('screen');
        if (cancelled) {
          await lock.release().catch(() => undefined);
          return;
        }
        lockRef.current = lock;
        lock.addEventListener('release', () => {
          if (lockRef.current === lock) lockRef.current = null;
        });
      } catch {
        /* denied / unsupported */
      }
    };

    void acquire();
    const onVis = () => {
      if (document.visibilityState === 'visible') void acquire();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      void lockRef.current?.release().catch(() => undefined);
      lockRef.current = null;
    };
  }, [active]);
}
