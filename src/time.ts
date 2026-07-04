/** Friendly, low-jargon timestamps for older users. */
export function relativeTime(at: number): string {
  if (!at) return '';
  const diff = Date.now() - at;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min} min ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  const d = new Date(at);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function clockTime(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
