import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { promotionPlan } from '@/modules/promotion/promotion';
import { pageData, requireActor } from '@/server/guard';
import { PromotionWizard } from './PromotionWizard';

export const metadata: Metadata = { title: 'Promote a class' };

export default async function PromotePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor('classes.manage');
  const { id } = await params;
  const plan = await pageData(promotionPlan(actor, id));
  return (
    <>
      <PageHeader eyebrow={<Link href="/admin/promotion">Promotion</Link>} title={`Promote ${plan.className}`} />
      <PromotionWizard plan={plan} />
    </>
  );
}
