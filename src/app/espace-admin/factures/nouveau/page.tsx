import { PageHeader } from '@/components/admin/page-kit';
import { DocumentForm, type DocumentValues } from '@/components/admin/document-form';
import { requirePermission } from '@/lib/auth/guard';
import { getCsrfToken } from '@/lib/auth/csrf';
import { documentOptions } from '@/lib/db/document-options';
import { getSetting, getSettingNumber } from '@/lib/db/repositories/settings';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Nouvelle facture' };

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; projet?: string }>;
}) {
  await requirePermission('invoices.create');
  const csrf = (await getCsrfToken()) ?? '';
  const query = await searchParams;
  const options = documentOptions();

  const project = query.projet ? options.projects.find((p) => String(p.id) === query.projet) : undefined;
  const clientId = query.client ?? (project?.client_id ? String(project.client_id) : '');
  const client = clientId ? options.clients.find((c) => String(c.id) === clientId) : undefined;

  const today = new Date().toISOString().slice(0, 10);
  const dueDays = getSettingNumber('finance.payment_due_days', 15);

  const initial: DocumentValues = {
    client_id: clientId,
    project_id: query.projet ?? '',
    title: project ? project.label : '',
    currency: client?.currency ?? project?.currency ?? options.currency,
    status: 'draft',
    issue_date: today,
    end_date: new Date(Date.now() + dueDays * 86400000).toISOString().slice(0, 10),
    discount_type: 'none',
    discount_value: '0',
    tax_rate: String(options.taxRate),
    payment_terms: getSetting('finance.payment_terms', '') ?? '',
    delivery_terms: '',
    conditions: '',
    notes: '',
    locale: 'fr',
    kind: 'standard',
    items: [],
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Nouvelle facture"
        description="Créée en brouillon : vérifiez les montants avant de l’émettre, car ils sont ensuite verrouillés."
        backHref="/espace-admin/factures"
        backLabel="Factures"
      />
      <DocumentForm
        kind="invoice"
        csrf={csrf}
        initial={initial}
        clients={options.clients}
        projects={options.projects}
        services={options.services}
      />
    </div>
  );
}
