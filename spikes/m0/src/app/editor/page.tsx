import { headers } from 'next/headers';
import { PROJECTS } from '@/lib/spike-projects';
import EditorSpike from './EditorSpike';

export default async function EditorPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const nonce = (await headers()).get('x-nonce') ?? '';
  const { project = 'python' } = await searchParams;
  const p = PROJECTS[project] ?? PROJECTS.python;
  return (
    <main className="page">
      <h1>{p.title}</h1>
      <EditorSpike key={p.id} project={p} nonce={nonce} previewOrigin={process.env.PREVIEW_ORIGIN ?? 'http://preview.localhost:3102'} />
    </main>
  );
}
