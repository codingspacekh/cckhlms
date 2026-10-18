import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/PageHeader';
import { getClubSettings } from '@/modules/club/service';
import { requireActor } from '@/server/guard';
import { SettingsForm } from './SettingsForm';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  await requireActor('settings.manage');
  const settings = await getClubSettings();
  return (
    <>
      <PageHeader eyebrow="Club" title="Settings" />
      <SettingsForm settings={settings} timeZones={Intl.supportedValuesOf('timeZone')} />
    </>
  );
}
