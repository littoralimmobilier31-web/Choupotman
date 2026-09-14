import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { PageHeader, SummaryStrip } from '@/components/admin/page-kit';
import { ServiceManager } from '@/components/admin/service-manager';
import { requirePermission } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { getCsrfToken } from '@/lib/auth/csrf';
import { SERVICE_FAMILIES, listServices } from '@/lib/db/repositories/content';
import { defaultCurrency } from '@/lib/db/repositories/finance';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Services' };

export default async function ServicesPage() {
  const user = await requirePermission('services.view');
  const csrf = (await getCsrfToken()) ?? '';

  // Not published-only: the admin manages drafts too.
  const services = listServices();
  const published = services.filter((service) => service.is_published === 1);

  return (
    <>
      <PageHeader
        title="Services"
        description="Votre catalogue de prestations. Il alimente la page publique /services et sert de base aux lignes de devis."
        actions={
          <Link
            href="/services"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[0.75rem] font-medium text-fg-muted transition-colors hover:text-fg"
          >
            <ExternalLink className="size-3.5" />
            Voir la page publique
          </Link>
        }
      />

      <SummaryStrip
        items={[
          { label: 'Publiées', value: published.length },
          { label: 'Masquées', value: services.length - published.length },
          { label: 'Mises en avant', value: services.filter((service) => service.is_featured === 1).length },
          { label: 'Familles utilisées', value: new Set(services.map((service) => service.family)).size },
        ]}
      />

      <ServiceManager
        csrf={csrf}
        currency={defaultCurrency()}
        canEdit={can(user, 'services.update')}
        canDelete={can(user, 'services.delete')}
        families={SERVICE_FAMILIES.map(({ key, label, description }) => ({ key, label, description }))}
        services={services.map((service) => ({
          id: service.id,
          name: service.name,
          slug: service.slug,
          family: service.family,
          short_description: service.short_description,
          description: service.description,
          bullets: service.bullets,
          deliverableList: service.deliverableList,
          starting_price: service.starting_price,
          currency: service.currency,
          price_note: service.price_note,
          duration_note: service.duration_note,
          position: service.position,
          is_published: service.is_published,
          is_featured: service.is_featured,
          seo_title: service.seo_title,
          seo_description: service.seo_description,
        }))}
      />
    </>
  );
}
