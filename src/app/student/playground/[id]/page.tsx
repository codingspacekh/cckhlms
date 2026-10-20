import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { PlaygroundWorkspace } from '@/components/playground/PlaygroundWorkspace';
import { PageHeader } from '@/components/ui/PageHeader';
import { WORK_LANGUAGE_LABEL, zipNameFor } from '@/modules/assessments/rules';
import { getClubSettings } from '@/modules/club/service';
import { openProject } from '@/modules/playground/playground';
import { pageData, requireActor } from '@/server/guard';
import { PREVIEW_ORIGIN } from '@/server/preview-origin';

export const metadata: Metadata = { title: 'Playground' };

// FR-CODE-07: one of the student's Playground projects in the editor.
export default async function PlaygroundProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor('playground.use');
  const { id } = await params;
  const [p, { timeZone }, nonce] = await Promise.all([
    pageData(openProject(actor, id)),
    getClubSettings(),
    headers().then((h) => h.get('x-nonce') ?? ''),
  ]);
  return (
    <>
      <PageHeader
        eyebrow={
          <>
            <Link href="/student/playground">Playground</Link> · {WORK_LANGUAGE_LABEL[p.language]}
          </>
        }
        title={p.name}
      />
      <PlaygroundWorkspace
        key={p.id}
        id={p.id}
        name={p.name}
        initial={p.files}
        savedAt={p.savedAt.toISOString()}
        nonce={nonce}
        java={p.language === 'java'}
        previewOrigin={p.language === 'web' ? PREVIEW_ORIGIN : undefined}
        zipName={zipNameFor(p.name, actor.username)}
        timeZone={timeZone}
      />
    </>
  );
}
