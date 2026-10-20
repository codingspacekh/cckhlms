import type { Metadata } from 'next';
import { PlaygroundList } from '@/components/playground/PlaygroundList';
import { PageHeader } from '@/components/ui/PageHeader';
import { formatDate, toClubTime } from '@/modules/academics/schedule';
import { getClubSettings } from '@/modules/club/service';
import { myProjects, PLAYGROUND_LIMIT } from '@/modules/playground/playground';
import { requireActor } from '@/server/guard';

export const metadata: Metadata = { title: 'Playground' };

// FR-CODE-07: a student's own projects, outside any class.
export default async function PlaygroundPage() {
  const actor = await requireActor('playground.use');
  const [projects, { timeZone }] = await Promise.all([myProjects(actor), getClubSettings()]);
  return (
    <>
      <PageHeader eyebrow="Learning" title="Playground" />
      <p className="small muted">
        Try out ideas in Python, Java or a web page. Your projects are saved as you type and only you can see them. Nothing here is marked.
      </p>
      <PlaygroundList
        limit={PLAYGROUND_LIMIT}
        projects={projects.map((p) => {
          const t = toClubTime(p.savedAt, timeZone);
          return { id: p.id, name: p.name, language: p.language, files: p.files, saved: `${formatDate(t.date)}, ${t.time}` };
        })}
      />
    </>
  );
}
