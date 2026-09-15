import { AlertTriangle } from 'lucide-react';
import { PageHeader, Section, SummaryStrip } from '@/components/admin/page-kit';
import { MessageComposer } from '@/components/admin/message-composer';
import { MessageList } from '@/components/admin/message-list';
import { TemplateManager } from '@/components/admin/template-manager';
import { requirePermission } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { getCsrfToken } from '@/lib/auth/csrf';
import {
  countMessages,
  listMessageTemplates,
  listMessages,
  templateVariables,
} from '@/lib/db/repositories/comms';
import { clientOptions } from '@/lib/db/repositories/clients';
import { projectOptions } from '@/lib/db/repositories/projects';
import { TEMPLATE_VARIABLE_HELP } from '@/lib/mail/templates';
import { config } from '@/lib/config';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Messagerie' };

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string; q?: string }>;
}) {
  const user = await requirePermission('messages.view');
  const query = await searchParams;
  const csrf = (await getCsrfToken()) ?? '';

  const messages = listMessages({
    status: (query.statut as 'draft' | 'queued' | 'sent' | 'failed') || undefined,
    search: query.q?.trim() || undefined,
    limit: 200,
  });

  const templates = listMessageTemplates();
  const canSend = can(user, 'messages.create');

  return (
    <>
      <PageHeader
        title="Messagerie"
        description="Relances, envois de devis et de factures, messages de suivi. Chaque envoi est conservé : l’historique dit ce que le client a réellement reçu."
      />

      {!config.mail.enabled && (
        <div className="mb-5 flex items-start gap-2.5 rounded-lg bg-warning-soft px-3.5 py-3" role="status">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div className="min-w-0">
            <p className="text-[0.8125rem] font-semibold text-fg">Aucun serveur d’envoi configuré</p>
            <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-fg-muted">
              Vous pouvez composer et enregistrer des messages : ils sont mis en attente et partiront dès que les
              paramètres SMTP seront renseignés. Rien n’est perdu entre-temps.
            </p>
          </div>
        </div>
      )}

      <SummaryStrip
        items={[
          { label: 'Envoyés', value: countMessages('sent'), href: '/espace-admin/messages?statut=sent' },
          { label: 'Brouillons', value: countMessages('draft'), href: '/espace-admin/messages?statut=draft' },
          { label: 'En attente', value: countMessages('queued'), href: '/espace-admin/messages?statut=queued' },
          { label: 'En échec', value: countMessages('failed'), href: '/espace-admin/messages?statut=failed' },
        ]}
      />

      <div className="mt-6 space-y-8">
        {canSend && (
          <Section title="Nouveau message">
            <MessageComposer
              csrf={csrf}
              mailConfigured={config.mail.enabled}
              clients={clientOptions().map((client) => ({ value: String(client.id), label: client.label }))}
              projects={projectOptions().map((project) => ({ value: String(project.id), label: project.label }))}
              templates={templates.map((template) => ({
                key: template.key,
                name: template.name,
                subject: template.subject,
                body: template.body,
              }))}
            />
          </Section>
        )}

        <Section
          title="Historique"
          description="Les messages envoyés ne sont ni modifiables ni supprimables : ils constituent la trace de vos échanges."
        >
          <MessageList
            csrf={csrf}
            canSend={canSend}
            mailConfigured={config.mail.enabled}
            queuedCount={countMessages('queued')}
            messages={messages.map((message) => ({
              id: message.id,
              subject: message.subject,
              body: message.body,
              to_name: message.to_name,
              to_address: message.to_address,
              status: message.status,
              error: message.error,
              template_key: message.template_key,
              client_name: message.client_name,
              project_title: message.project_title,
              sent_at: message.sent_at,
              created_at: message.created_at,
            }))}
          />
        </Section>

        {can(user, 'messages.update') && (
          <Section
            title="Modèles"
            description="Les variables entre doubles accolades sont remplacées à l’envoi, à partir de la fiche client et du projet liés."
          >
            <TemplateManager
              csrf={csrf}
              variableHelp={TEMPLATE_VARIABLE_HELP}
              templates={templates.map((template) => ({
                id: template.id,
                key: template.key,
                name: template.name,
                channel: template.channel,
                subject: template.subject,
                body: template.body,
                locale: template.locale,
                description: template.description,
                variables: templateVariables(`${template.subject ?? ''} ${template.body}`),
              }))}
            />
          </Section>
        )}
      </div>
    </>
  );
}
