import { Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/admin/page-kit';
import { AssistantChat } from '@/components/admin/assistant-chat';
import { requirePermission } from '@/lib/auth/guard';
import { getCsrfToken } from '@/lib/auth/csrf';
import { available } from '@/lib/ai/client';
import { getAiUsage } from '@/lib/db/repositories/ai';
import { getSiteProfile } from '@/lib/site';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Choupotman AI' };

export default async function AssistantPage() {
  await requirePermission('ai.view');
  const csrf = (await getCsrfToken()) ?? '';
  const aiConfigured = available();
  const usage = getAiUsage(30);
  const profile = getSiteProfile();

  return (
    <>
      <PageHeader
        title="Choupotman AI"
        description="Votre assistant de gestion. Il lit vos données réelles et vous demande confirmation avant toute action qui modifie quelque chose."
        badges={
          aiConfigured ? (
            <Badge tone="success">
              <Sparkles className="size-3" />
              Actif
            </Badge>
          ) : (
            <Badge tone="warning">Clé API manquante</Badge>
          )
        }
        actions={
          usage.conversations > 0 && (
            <span className="text-[0.75rem] tabular-nums text-fg-subtle">
              {usage.conversations} conversation(s) sur 30 jours
            </span>
          )
        }
      />

      <AssistantChat csrf={csrf} aiConfigured={aiConfigured} ownerName={profile.ownerName} />
    </>
  );
}
