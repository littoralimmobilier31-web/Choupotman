import { PageHeader } from '@/components/admin/page-kit';
import { ClientForm } from '@/components/admin/client-form';
import { requirePermission } from '@/lib/auth/guard';
import { getCsrfToken } from '@/lib/auth/csrf';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Nouveau client' };

export default async function NewClientPage() {
  await requirePermission('clients.create');
  const csrf = await getCsrfToken();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Nouveau client"
        description="Seul le nom est obligatoire — le reste peut être complété plus tard."
        backHref="/espace-admin/clients"
        backLabel="Clients"
      />
      <ClientForm csrf={csrf ?? ''} />
    </div>
  );
}
