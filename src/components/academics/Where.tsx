// Where a class meets, as the lists show it, and its Join on Zoom button (FR-STU-13, BR-28; M14). The link only
// reaches pages for the class's own students and teachers, and Admin.

export function Where({ mode, room, label = 'Online' }: { mode: string; room: string | null; label?: string }) {
  if (mode !== 'online') return <>{room ?? '—'}</>;
  return (
    <span className="mode">
      <span className="z" aria-hidden="true">
        Z
      </span>
      {label}
    </span>
  );
}

export function JoinZoom({ href, size }: { href: string; size?: 'lg' | 'sm' }) {
  return (
    <a className={`btn zoom${size ? ` ${size}` : ''}`} href={href} target="_blank" rel="noopener noreferrer">
      Join on Zoom
      <span aria-hidden="true">↗</span>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
