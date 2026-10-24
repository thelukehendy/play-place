/**
 * Keep play UI clear of iOS Safari's floating tab / URL bar.
 * Writes --chrome-bottom on :root from visualViewport vs layout viewport.
 */
export function installViewportChrome() {
  const root = document.documentElement;

  const sync = () => {
    const vv = window.visualViewport;
    let chrome = 0;
    if (vv) {
      chrome = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    }
    // Home-indicator alone is in safe-area; Safari's toolbar often needs more.
    // Floor when running in browser (not installed PWA) so controls stay tappable.
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS Safari legacy
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    if (!standalone) {
      chrome = Math.max(chrome, 52);
    }
    root.style.setProperty('--chrome-bottom', `${Math.round(chrome)}px`);
  };

  sync();
  window.addEventListener('resize', sync);
  window.visualViewport?.addEventListener('resize', sync);
  window.visualViewport?.addEventListener('scroll', sync);
  window.addEventListener('orientationchange', sync);

  return () => {
    window.removeEventListener('resize', sync);
    window.visualViewport?.removeEventListener('resize', sync);
    window.visualViewport?.removeEventListener('scroll', sync);
    window.removeEventListener('orientationchange', sync);
  };
}
