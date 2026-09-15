import Link from 'next/link';
import { ExternalLink, Image as ImageIcon, Plus, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { TableWrap, Table, Thead, Th, Tbody, Tr, Td } from '@/components/ui/table';
import { PageHeader, SummaryStrip, ListEmpty, DemoBadge } from '@/components/admin/page-kit';
import { ListFilters } from '@/components/admin/list-filters';
import { requirePermission } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { countPortfolio, listCategories, listPortfolio, portfolioFacets } from '@/lib/db/repositories/content';
import { formatShortDate } from '@/lib/i18n/format';
import type { PublishStatus } from '@/lib/db/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Portfolio' };

const STATUS_TONES: Record<string, 'success' | 'neutral' | 'outline'> = {
  published: 'success',
  draft: 'neutral',
  archived: 'outline',
};

const STATUS_LABELS: Record<string, string> = {
  published: 'Publié',
  draft: 'Brouillon',
  archived: 'Archivé',
};

export default async function PortfolioPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; statut?: string; categorie?: string; techno?: string; annee?: string }>;
}) {
  const user = await requirePermission('portfolio.view');
  const query = await searchParams;

  const filter = {
    search: query.q?.trim() || undefined,
    status: (query.statut as PublishStatus | 'all') || 'all',
    categoryId: Number.parseInt(query.categorie ?? '', 10) || undefined,
    technology: query.techno || undefined,
    year: Number.parseInt(query.annee ?? '', 10) || undefined,
  };

  const projects = listPortfolio({ ...filter, limit: 200 });
  const categories = listCategories('portfolio');
  const facets = portfolioFacets();

  return (
    <>
      <PageHeader
        title="Portfolio"
        description="Les réalisations affichées sur /projets. Chaque projet est décrit ici : rien n’est ajouté automatiquement."
        actions={
          <>
            <Link
              href="/projets"
              target="_blank"
              rel="noreferrer"
              className={buttonClass('secondary', 'sm')}
            >
              <ExternalLink className="size-3.5" />
              Voir la page publique
            </Link>
            {can(user, 'portfolio.create') && (
              <Link href="/espace-admin/portfolio/nouveau" className={buttonClass('primary', 'sm')}>
                <Plus className="size-4" />
                Nouveau projet
              </Link>
            )}
          </>
        }
      />

      <SummaryStrip
        items={[
          {
            label: 'Publiés',
            value: countPortfolio({ status: 'published' }),
            href: '/espace-admin/portfolio?statut=published',
          },
          {
            label: 'Brouillons',
            value: countPortfolio({ status: 'draft' }),
            href: '/espace-admin/portfolio?statut=draft',
          },
          {
            label: 'Archivés',
            value: countPortfolio({ status: 'archived' }),
            href: '/espace-admin/portfolio?statut=archived',
          },
          { label: 'Mis en avant', value: countPortfolio({ featuredOnly: true, status: 'all' }) },
          { label: 'Total', value: countPortfolio({ status: 'all' }), href: '/espace-admin/portfolio' },
        ]}
      />

      <ListFilters
        searchPlaceholder="Titre, résumé, client…"
        resultCount={projects.length}
        selects={[
          {
            key: 'statut',
            label: 'Statut',
            allLabel: 'Tous les statuts',
            options: [
              { value: 'published', label: 'Publiés' },
              { value: 'draft', label: 'Brouillons' },
              { value: 'archived', label: 'Archivés' },
            ],
          },
          ...(categories.length > 0
            ? [
                {
                  key: 'categorie',
                  label: 'Catégorie',
                  allLabel: 'Toutes les catégories',
                  options: categories.map((category) => ({ value: String(category.id), label: category.name })),
                },
              ]
            : []),
          ...(facets.technologies.length > 0
            ? [
                {
                  key: 'techno',
                  label: 'Technologie',
                  allLabel: 'Toutes les technologies',
                  options: facets.technologies.map((technology) => ({ value: technology, label: technology })),
                },
              ]
            : []),
          ...(facets.years.length > 0
            ? [
                {
                  key: 'annee',
                  label: 'Année',
                  allLabel: 'Toutes les années',
                  options: facets.years.map((year) => ({ value: String(year), label: String(year) })),
                },
              ]
            : []),
        ]}
      />

      <div className="mt-5">
        {projects.length === 0 ? (
          <ListEmpty
            icon={<ImageIcon className="size-5" />}
            title="Aucune réalisation"
            description="Ajoutez un projet pour le faire apparaître sur /projets. Tant qu’il reste en brouillon, il n’est visible que par vous."
            actionHref={can(user, 'portfolio.create') ? '/espace-admin/portfolio/nouveau' : undefined}
            actionLabel="Nouveau projet"
          />
        ) : (
          <TableWrap>
            <Table>
              <Thead>
                <tr>
                  <Th>Projet</Th>
                  <Th>Client affiché</Th>
                  <Th alignment="center">Statut</Th>
                  <Th>Technologies</Th>
                  <Th>Date</Th>
                  <Th alignment="end">Vues</Th>
                </tr>
              </Thead>
              <Tbody>
                {projects.map((project) => (
                  <Tr key={project.id}>
                    <Td>
                      <Link href={`/espace-admin/portfolio/${project.id}`} className="group block min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="truncate font-medium text-fg group-hover:text-accent">
                            {project.title}
                          </span>
                          {project.is_featured === 1 && (
                            <Star className="size-3.5 shrink-0 fill-warning text-warning" aria-label="Mis en avant" />
                          )}
                          <DemoBadge when={project.is_demo} />
                        </span>
                        {project.summary && (
                          <span className="line-clamp-1 text-[0.6875rem] text-fg-subtle">{project.summary}</span>
                        )}
                      </Link>
                    </Td>
                    <Td className="text-[0.8125rem] text-fg-muted">
                      {project.client_name ?? <span className="text-fg-subtle">non nommé</span>}
                    </Td>
                    <Td alignment="center">
                      <Badge tone={STATUS_TONES[project.status] ?? 'neutral'}>
                        {STATUS_LABELS[project.status] ?? project.status}
                      </Badge>
                    </Td>
                    <Td className="text-[0.6875rem] text-fg-subtle">
                      {project.technologyList.length > 0 ? (
                        <>
                          {project.technologyList.slice(0, 3).join(' · ')}
                          {project.technologyList.length > 3 && ` +${project.technologyList.length - 3}`}
                        </>
                      ) : (
                        '—'
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-[0.75rem] text-fg-muted">
                      {project.project_date
                        ? formatShortDate(project.project_date, 'fr')
                        : (project.year ?? <span className="text-fg-subtle">—</span>)}
                    </Td>
                    <Td alignment="end" className="tabular-nums text-[0.75rem] text-fg-muted">
                      {project.view_count}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableWrap>
        )}
      </div>
    </>
  );
}
