'use client';
import { Icon } from '@/components/ui/Icon';

export type SlipData = { name: string; username: string; password: string };

// One login slip (FR-AUTH-09): the club, where to sign in, and the account. Used on its own after adding a person,
// and in a sheet to print for a class or an import.
export function SlipCard({ slip, clubName, site, className }: { slip: SlipData; clubName: string; site: string; className?: string }) {
  return (
    <div className="slip">
      <b>
        {clubName} · {site}
      </b>
      {className && <span className="slip-class">{className}</span>}
      <span>Name: {slip.name}</span>
      <span>
        Username: <span data-testid="slip-username">{slip.username}</span>
      </span>
      <span>
        Password: <span data-testid="slip-password">{slip.password}</span>
      </span>
    </div>
  );
}

// The passwords exist only here, in the browser, until Done: only their hashes are stored (FR-AUTH-07). When
// printing, the sheet is all that shows (see .print-area in globals.css).
export function SlipSheet({
  title,
  clubName,
  site,
  className,
  slips,
  onDone,
}: {
  title: string;
  clubName: string;
  site: string;
  className?: string;
  slips: SlipData[];
  onDone: () => void;
}) {
  return (
    <section className="print-area stack" aria-label="Login slips">
      <div className="no-print stack">
        <h2>{title}</h2>
        <p className="note warn">
          <strong>Shown once.</strong> Print the slips now. Only a hash of each password is stored, so nobody can see these passwords again.
          If a slip is lost, reset that student&apos;s password.
        </p>
        <div className="row">
          <button type="button" className="btn primary" onClick={() => window.print()}>
            <Icon name="printer" /> Print slips
          </button>
          <button type="button" className="btn ghost" onClick={onDone}>
            Done
          </button>
        </div>
      </div>
      <ul className="slip-grid">
        {slips.map((s) => (
          <li key={s.username}>
            <SlipCard slip={s} clubName={clubName} site={site} className={className} />
          </li>
        ))}
      </ul>
    </section>
  );
}
