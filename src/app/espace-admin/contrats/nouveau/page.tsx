import { PageHeader } from '@/components/admin/page-kit';
import { ContractForm } from '@/components/admin/contract-form';
import { requirePermission } from '@/lib/auth/guard';
import { getCsrfToken } from '@/lib/auth/csrf';
import { defaultCurrency, listContractTemplates } from '@/lib/db/repositories/finance';
import { clientOptions } from '@/lib/db/repositories/clients';
import { projectOptions } from '@/lib/db/repositories/projects';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Nouveau contrat' };

export default async function NewContractPage() {
  await requirePermission('contracts.create');
  const csrf = (await getCsrfToken()) ?? '';

  const templates = listContractTemplates();

  return (
    <>
      <PageHeader
        title="Nouveau contrat"
        description="Choisissez un modèle : les informations du client et du projet sont insérées à la création, puis le texte est figé."
        backHref="/espace-admin/contrats"
        backLabel="Contrats"
      />

      <ContractForm
        csrf={csrf}
        currency={defaultCurrency()}
        clients={clientOptions().map((client) => ({ value: String(client.id), label: client.label }))}
        projects={projectOptions().map((project) => ({
          value: String(project.id),
          label: project.label,
          clientId: project.client_id,
        }))}
        templates={templates.map((template) => ({
          id: template.id,
          name: template.name,
          body: template.body,
          is_default: template.is_default,
        }))}
      />
    </>
  );
}
