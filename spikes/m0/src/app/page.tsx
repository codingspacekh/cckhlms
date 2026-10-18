import Link from 'next/link';
import { PROJECTS } from '@/lib/spike-projects';

export default function Home() {
  return (
    <main className="page">
      <h1>M0 spikes</h1>
      <ul>
        {Object.values(PROJECTS).map((p) => (
          <li key={p.id}><Link href={`/editor?project=${p.id}`}>{p.title}</Link></li>
        ))}
      </ul>
    </main>
  );
}
