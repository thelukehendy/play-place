/** Build a clean absolute invite URL that opens straight into a room. */
export function roomInviteUrl(code: string): string {
  const url = new URL(window.location.href);
  let path = url.pathname;
  if (path.endsWith('index.html')) {
    path = path.slice(0, -'index.html'.length);
  }
  if (!path.endsWith('/')) {
    // Keep directory base for GitHub Pages project sites, e.g. /play-place/
    const last = path.split('/').pop() ?? '';
    if (last.includes('.')) {
      path = path.slice(0, path.lastIndexOf('/') + 1);
    } else {
      path = `${path}/`;
    }
  }
  url.pathname = path;
  url.search = '';
  url.hash = '';
  url.searchParams.set('room', code.trim().toUpperCase());
  return url.toString();
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.setAttribute('readonly', '');
      el.style.position = 'fixed';
      el.style.left = '-9999px';
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }
}

export async function shareRoomInvite(code: string): Promise<'shared' | 'copied' | 'failed'> {
  const url = roomInviteUrl(code);
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'Play Place',
        text: `Join my Play Place room ${code.toUpperCase()}`,
        url,
      });
      return 'shared';
    } catch (err) {
      // User cancelled share sheet — fall through to copy only if not AbortError
      if (err instanceof DOMException && err.name === 'AbortError') return 'failed';
    }
  }
  const ok = await copyText(url);
  return ok ? 'copied' : 'failed';
}
