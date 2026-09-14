import { PageHeader } from '@/components/admin/page-kit';
import { DocumentForm, type DocumentValues } from '@/components/admin/document-form';
import { requirePermission } from '@/lib/auth/guard';
import { getCsrfToken } from '@/lib/auth/csrf';
import { documentOptions } from '@/lib/db/document-options';
import { getSetting, getSettingNumber } from '@/lib/db/repositories/settings';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Nouveau devis' };

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; projet?: string }>;
}) {
  await requirePermission('quotes.create');
  const csrf = (await getCsrfToken()) ?? '';
  const query = await searchParams;
  const options = documentOptions();

  // Pre-fill when arriving from a client or project page.
  const project = query.projet ? options.projects.find((p) => String(p.id) === query.projet) : undefined;
  const clientId = query.client ?? (project?.client_id ? String(project.client_id) : '');
  const client = clientId ? options.clients.find((c) => String(c.id) === clientId) : undefined;

  const today = new Date().toISOString().slice(0, 10);
  const validityDays = getSettingNumber('finance.quote_validity_days', 30);

  const initial: DocumentValues = {
    client_id: clientId,
    project_id: query.projet ?? '',
    title: project ? project.label : '',
    currency: client?.currency ?? project?.currency ?? options.currency,
    status: 'draft',
    issue_date: today,
    end_date: new Date(Date.now() + validityDays * 86400000).toISOString().slice(0, 10),
    discount_type: 'none',
    discount_value: '0',
    tax_rate: String(options.taxRate),
    payment_terms: getSetting('finance.payment_terms', '') ?? '',
    delivery_terms: '',
    conditions: getSetting('finance.quote_conditions', '') ?? '',
    notes: '',
    locale: 'fr',
    kind: 'standard',
    items: [],
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Nouveau devis"
        description="Le numéro est attribué à la création et suit une séquence continue."
        backHref="/espace-admin/devis"
        backLabel="Devis"
      />
      <DocumentForm
        kind="quote"
        csrf={csrf}
        initial={initial}
        clients={options.clients}
        projects={options.projects}
        services={options.services}
      />
    </div>
  );
}
