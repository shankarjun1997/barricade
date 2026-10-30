export function formatClock(ms: number): string {
  const safe = Math.max(0, ms);
  const totalSeconds = safe / 1000;
  if (totalSeconds >= 60) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
  if (totalSeconds >= 10) {
    return `0:${Math.floor(totalSeconds).toString().padStart(2, '0')}`;
  }
  return `0:${totalSeconds.toFixed(1).padStart(4, '0')}`;
}

export function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function formatDate(ts: number): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(ts));
}

export function formatDateTime(ts: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ts));
}

export function formatTimeControl(initialMs: number, incrementMs: number): string {
  if (initialMs === 0) return 'Unlimited';
  const base = formatClock(initialMs);
  return incrementMs > 0 ? `${base} +${Math.round(incrementMs / 1000)}s` : base;
}

export function plural(count: number, singular: string, pluralForm?: string): string {
  return count === 1 ? singular : (pluralForm ?? `${singular}s`);
}

export function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function reasonLabel(reason: string): string {
  switch (reason) {
    case 'goal':
      return 'Reached the home space';
    case 'resign':
      return 'Opponent resigned';
    case 'timeout':
      return 'Flag fell';
    case 'forfeit':
      return 'Forfeit';
    case 'repetition':
      return 'Threefold repetition';
    case 'move-limit':
      return 'Move limit reached';
    case 'agreement':
      return 'Draw agreed';
    case 'budget':
      return 'Move budget exceeded';
    default:
      return titleCase(reason);
  }
}

export function describeMove(move: { kind: 'move'; to: { r: number; c: number } } | { kind: 'wall'; orientation: 'H' | 'V'; r: number; c: number }, size: number): string {
  if (move.kind === 'move') {
    return `Cast to ${columnName(move.to.c)}${size - move.to.r}`;
  }
  return `${move.orientation === 'H' ? 'Horizontal' : 'Vertical'} barrier ${columnName(move.c)}${size - move.r}`;
}

export function columnName(index: number): string {
  return String.fromCharCode(65 + index);
}
