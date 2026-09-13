import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Building2, ExternalLink, FolderKanban, Globe, Mail,
  MapPin, MessageCircle, Phone, Plus, Receipt, Banknote,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, Progress } from '@/components/ui/misc';
import { TableWrap, Table, Thead, Th, Tbody, Tr, Td } from '@/components/ui/table';
import { PageHeader, Section, DetailGrid, MiniStat, DemoBadge, ListEmpty } from '@/components/admin/page-kit';
import { ClientForm, type ClientFormValues } from '@/components/admin/client-form';
import { requirePermission } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { getCsrfToken } from '@/lib/auth/csrf';
import { getClientDossier, listClientUsers } from '@/lib/db/repositories/clients';
import { invoiceStatusLabel, paymentMethodLabel } from '@/lib/db/repositories/finance';
import { projectStatusLabel } from '@/lib/db/repositories/projects';
import { listMessages } from '@/lib/db/repositories/comms';
import { formatMoney, formatShortDate, formatRelative } from '@/lib/i18n/format';

export const dynamic = 'force-dynamic';

const INVOICE_TONES: Record<string, 'neutral' | 'info' | 'warning' | 'success' | 'danger' | 'outline'> = {
  draft: 'neutral', sent: 'info', partially_paid: 'warning',
  paid: 'success', overdue: 'danger', cancelled: 'outline',
};

const PROJECT_TONES: Record<string, 'neutral' | 'info' | 'brand' | 'warning' | 'success' | 'outline'> = {
  prospect: 'neutral', planning: 'info', in_progress: 'brand', in_review: 'warning',
  awaiting_client: 'warning', completed: 'success', archived: 'outline',
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dossier = getClientDossier(Number.parseInt(id, 10));
  return { title: dossier?.client.name ?? 'Client' };
}

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ onglet?: string }>;
}) {
  const user = await requirePermission('clients.view');
  const { id: raw } = await params;
  const { onglet } = await searchParams;
  const id = Number.parseInt(raw, 10);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const dossier = getClientDossier(id);
  if (!dossier) notFound();

  const { client, projects, invoices, payments, totals } = dossier;
  const csrf = await getCsrfToken();
  const portalUsers = listClientUsers(id);
  const messages = can(user, 'messages.view') ? listMessages({ clientId: id, limit: 8 }) : [];
  const editing = onglet === 'modifier' && can(user, 'clients.update');

  const initialValues: ClientFormValues = {
    name: client.name,
    company: client.company ?? '',
    email: client.email ?? '',
    phone: client.phone ?? '',
    whatsapp: client.whatsapp ?? '',
    country: client.country ?? '',
    city: client.city ?? '',
    address: client.address ?? '',
    website: client.website ?? '',
    tax_id: client.tax_id ?? '',
    currency: client.currency,
    preferred_locale: (client.preferred_locale as 'fr' | 'ar' | 'en') ?? 'fr',
    status: client.status,
    source: client.source ?? 'manual',
    notes: client.notes ?? '',
    linkedin: client.social.linkedin ?? '',
    instagram: client.social.instagram ?? '',
    facebook: client.social.facebook ?? '',
  };

  return (
    <>
      <PageHeader
        title={client.name}
        description={client.company ?? undefined}
        backHref="/espace-admin/clients"
        backLabel="Clients"
        badges={
          <>
            <Badge tone={client.status === 'active' ? 'success' : client.status === 'archived' ? 'outline' : 'neutral'}>
              {client.status === 'active' ? 'Actif' : client.status === 'archived' ? 'Archivé' : 'Inactif'}
            </Badge>
            <DemoBadge when={client.is_demo} />
          </>
        }
        actions={
          <>
            {can(user, 'clients.update') && (
              <Link
                href={editing ? `/espace-admin/clients/${id}` : `/espace-admin/clients/${id}?onglet=modifier`}
                className={buttonClass(editing ? 'secondary' : 'primary', 'sm')}
              >
                {editing ? 'Annuler' : 'Modifier'}
              </Link>
            )}
            {can(user, 'projects.create') && (
              <Link
                href={`/espace-admin/projets/nouveau?client=${id}`}
                className={buttonClass('secondary', 'sm')}
              >
                <Plus className="size-4" />
                Projet
              </Link>
            )}
            {can(user, 'quotes.create') && (
              <Link href={`/espace-admin/devis/nouveau?client=${id}`} className={buttonClass('secondary', 'sm')}>
                <Plus className="size-4" />
                Devis
              </Link>
            )}
          </>
        }
      />

      {editing ? (
        <div className="mx-auto max-w-3xl">
          <ClientForm
            csrf={csrf ?? ''}
            clientId={id}
            initial={initialValues}
            canDelete={can(user, 'clients.delete')}
          />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <div className="min-w-0 space-y-6">
            {/* Financial roll-up */}
            <Card>
              <CardBody className="grid grid-cols-2 gap-5 sm:grid-cols-4">
                <MiniStat
                  label="CA encaissé"
                  value={formatMoney(totals.revenue, client.currency)}
                  tone="success"
                />
                <MiniStat label="Facturé" value={formatMoney(totals.invoiced, client.currency)} />
                <MiniStat
                  label="En attente"
                  value={formatMoney(totals.outstanding, client.currency)}
                  tone={totals.outstanding > 0 ? 'warning' : 'default'}
                />
                <MiniStat
                  label="En retard"
                  value={formatMoney(totals.overdue, client.currency)}
                  tone={totals.overdue > 0 ? 'danger' : 'default'}
                />
              </CardBody>
            </Card>

            {/* Projects */}
            <Section
              title={`Projets (${projects.length})`}
              action={
                can(user, 'projects.create') && (
                  <Link
                    href={`/espace-admin/projets/nouveau?client=${id}`}
                    className="text-[0.75rem] font-semibold text-accent hover:underline"
                  >
                    Ajouter
                  </Link>
                )
              }
            >
              {projects.length === 0 ? (
                <ListEmpty
                  icon={<FolderKanban className="size-5" />}
                  title="Aucun projet"
                  description="Ce client n’a pas encore de projet enregistré."
                  actionHref={can(user, 'projects.create') ? `/espace-admin/projets/nouveau?client=${id}` : undefined}
                  actionLabel="Créer un projet"
                />
              ) : (
                <Card>
                  <CardBody className="space-y-4">
                    {projects.map((project) => (
                      <Link key={project.id} href={`/espace-admin/projets/${project.id}`} className="group block">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="min-w-0 truncate text-[0.875rem] font-medium text-fg group-hover:text-accent">
                            {project.title}
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <Badge tone={PROJECT_TONES[project.status] ?? 'neutral'}>
                              {projectStatusLabel(project.status)}
                            </Badge>
                            <span className="text-[0.75rem] font-semibold tabular-nums text-fg-muted">
                              {project.progress}%
                            </span>
                          </span>
                        </div>
                        <p className="mt-0.5 text-[0.6875rem] text-fg-subtle">
                          {project.reference}
                          {project.budget > 0 ? ` · ${formatMoney(project.budget, project.currency)}` : ''}
                          {project.delivery_date ? ` · livraison ${formatShortDate(project.delivery_date, 'fr')}` : ''}
                        </p>
                        <Progress className="mt-2" value={project.progress} />
                      </Link>
                    ))}
                  </CardBody>
                </Card>
              )}
            </Section>

            {/* Invoices */}
            {can(user, 'invoices.view') && (
              <Section
                title={`Factures (${invoices.length})`}
                action={
                  can(user, 'invoices.create') && (
                    <Link
                      href={`/espace-admin/factures/nouveau?client=${id}`}
                      className="text-[0.75rem] font-semibold text-accent hover:underline"
                    >
                      Ajouter
                    </Link>
                  )
                }
              >
                {invoices.length === 0 ? (
                  <ListEmpty icon={<Receipt className="size-5" />} title="Aucune facture" />
                ) : (
                  <TableWrap>
                    <Table>
                      <Thead>
                        <tr>
                          <Th>Numéro</Th>
                          <Th>Date</Th>
                          <Th alignment="end">Total</Th>
                          <Th alignment="end">Solde</Th>
                          <Th alignment="center">Statut</Th>
                        </tr>
                      </Thead>
                      <Tbody>
                        {invoices.map((invoice) => (
                          <Tr key={invoice.id}>
                            <Td>
                              <Link
                                href={`/espace-admin/factures/${invoice.id}`}
                                className="font-medium text-fg transition-colors hover:text-accent"
                              >
                                {invoice.number}
                              </Link>
                            </Td>
                            <Td className="whitespace-nowrap text-[0.75rem] text-fg-subtle">
                              {formatShortDate(invoice.issue_date, 'fr')}
                            </Td>
                            <Td alignment="end" className="tabular-nums">
                              {formatMoney(invoice.total, invoice.currency)}
                            </Td>
                            <Td alignment="end" className="tabular-nums">
                              {invoice.balance_due > 0 ? (
                                <span className="font-semibold text-warning">
                                  {formatMoney(invoice.balance_due, invoice.currency)}
                                </span>
                              ) : (
                                '—'
                              )}
                            </Td>
                            <Td alignment="center">
                              <Badge tone={INVOICE_TONES[invoice.status] ?? 'neutral'}>
                                {invoiceStatusLabel(invoice.status)}
                              </Badge>
                            </Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  </TableWrap>
                )}
              </Section>
            )}

            {/* Payments */}
            {can(user, 'payments.view') && payments.length > 0 && (
              <Section title={`Paiements (${payments.length})`}>
                <TableWrap>
                  <Table>
                    <Thead>
                      <tr>
                        <Th>Date</Th>
                        <Th>Méthode</Th>
                        <Th>Référence</Th>
                        <Th alignment="end">Montant</Th>
                      </tr>
                    </Thead>
                    <Tbody>
                      {payments.map((payment) => (
                        <Tr key={payment.id}>
                          <Td className="whitespace-nowrap">{formatShortDate(payment.paid_at, 'fr')}</Td>
                          <Td>
                            <span className="inline-flex items-center gap-1.5">
                              <Banknote className="size-3.5 text-fg-subtle" />
                              {paymentMethodLabel(payment.method)}
                            </span>
                          </Td>
                          <Td className="text-[0.75rem] text-fg-subtle">{payment.reference ?? '—'}</Td>
                          <Td alignment="end" className="font-semibold tabular-nums text-success">
                            {formatMoney(payment.amount, payment.currency)}
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </TableWrap>
              </Section>
            )}

            {/* Communications */}
            {messages.length > 0 && (
              <Section title="Derniers messages">
                <Card>
                  <CardBody className="divide-y divide-line">
                    {messages.map((message) => (
                      <Link
                        key={message.id}
                        href={`/espace-admin/messages/${message.id}`}
                        className="-mx-2 block rounded-md px-2 py-2.5 transition-colors hover:bg-surface-hover"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="min-w-0 truncate text-[0.8125rem] font-medium text-fg">
                            {message.subject ?? '(sans objet)'}
                          </span>
                          <Badge tone={message.status === 'sent' ? 'success' : message.status === 'failed' ? 'danger' : 'neutral'}>
                            {message.status === 'sent' ? 'Envoyé' : message.status === 'queued' ? 'En file' : message.status === 'failed' ? 'Échec' : 'Brouillon'}
                          </Badge>
                        </div>
                        <p className="mt-0.5 text-[0.6875rem] text-fg-subtle">
                          {formatRelative(message.created_at, 'fr')}
                        </p>
                      </Link>
                    ))}
                  </CardBody>
                </Card>
              </Section>
            )}
          </div>

          {/* Sidebar */}
          <aside className="space-y-5 lg:sticky lg:top-20">
            <Card>
              <CardBody>
                <div className="flex items-center gap-3">
                  <Avatar name={client.name} src={client.avatar_path} size={44} />
                  <div className="min-w-0">
                    <p className="truncate text-[0.9375rem] font-semibold text-fg">{client.name}</p>
                    {client.company && (
                      <p className="flex items-center gap-1 truncate text-[0.75rem] text-fg-subtle">
                        <Building2 className="size-3" />
                        {client.company}
                      </p>
                    )}
                  </div>
                </div>

                <ul className="mt-5 space-y-3 text-[0.8125rem]">
                  {client.email && (
                    <li>
                      <a href={`mailto:${client.email}`} className="flex items-start gap-2.5 text-fg-muted transition-colors hover:text-accent">
                        <Mail className="mt-0.5 size-3.5 shrink-0" />
                        <span className="break-all">{client.email}</span>
                      </a>
                    </li>
                  )}
                  {client.phone && (
                    <li>
                      <a href={`tel:${client.phone.replace(/\s/g, '')}`} className="flex items-center gap-2.5 text-fg-muted transition-colors hover:text-accent">
                        <Phone className="size-3.5 shrink-0" />
                        {client.phone}
                      </a>
                    </li>
                  )}
                  {client.whatsapp && (
                    <li>
                      <a
                        href={`https://wa.me/${client.whatsapp.replace(/[^0-9]/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2.5 text-fg-muted transition-colors hover:text-accent"
                      >
                        <MessageCircle className="size-3.5 shrink-0" />
                        WhatsApp
                      </a>
                    </li>
                  )}
                  {(client.address || client.city || client.country) && (
                    <li className="flex items-start gap-2.5 text-fg-muted">
                      <MapPin className="mt-0.5 size-3.5 shrink-0" />
                      <span>{[client.address, client.city, client.country].filter(Boolean).join(', ')}</span>
                    </li>
                  )}
                  {client.website && (
                    <li>
                      <a
                        href={client.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2.5 text-fg-muted transition-colors hover:text-accent"
                      >
                        <Globe className="size-3.5 shrink-0" />
                        <span className="truncate">{client.website.replace(/^https?:\/\//, '')}</span>
                        <ExternalLink className="size-3 shrink-0 opacity-60" />
                      </a>
                    </li>
                  )}
                </ul>
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Informations</CardTitle>
              </CardHeader>
              <CardBody className="pt-3">
                <DetailGrid
                  columns={2}
                  items={[
                    { label: 'Devise', value: client.currency },
                    { label: 'Langue', value: client.preferred_locale.toUpperCase() },
                    { label: 'NIF', value: client.tax_id ?? '—' },
                    { label: 'Origine', value: client.source ?? '—' },
                    { label: 'Client depuis', value: formatShortDate(client.created_at, 'fr') },
                    { label: 'Projets', value: `${totals.completedProjects}/${totals.projectCount} terminés` },
                  ]}
                />
              </CardBody>
            </Card>

            {client.notes && (
              <Card>
                <CardHeader>
                  <CardTitle>Notes internes</CardTitle>
                </CardHeader>
                <CardBody className="pt-3">
                  <p className="whitespace-pre-line text-[0.8125rem] leading-relaxed text-fg-muted">
                    {client.notes}
                  </p>
                </CardBody>
              </Card>
            )}

            {client.social.linkedin || client.social.instagram || client.social.facebook ? (
              <Card>
                <CardHeader>
                  <CardTitle>Réseaux</CardTitle>
                </CardHeader>
                <CardBody className="flex flex-wrap gap-2 pt-3">
                  {(
                    [
                      ['LinkedIn', client.social.linkedin],
                      ['Instagram', client.social.instagram],
                      ['Facebook', client.social.facebook],
                    ] as const
                  )
                    .filter(([, url]) => url)
                    .map(([label, url]) => (
                      <a
                        key={label}
                        href={url as string}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex rounded-md border border-line px-2.5 py-1 text-[0.6875rem] font-medium text-fg-muted transition-colors hover:border-accent hover:text-accent"
                      >
                        {label}
                      </a>
                    ))}
                </CardBody>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>Espace client</CardTitle>
              </CardHeader>
              <CardBody className="pt-3">
                {portalUsers.length === 0 ? (
                  <p className="text-[0.75rem] leading-relaxed text-fg-muted">
                    Aucun accès client créé. Le portail client permettra à ce client de suivre ses projets,
                    ses fichiers et ses factures.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {portalUsers.map((portalUser) => (
                      <li key={portalUser.id} className="flex items-center justify-between gap-2 text-[0.75rem]">
                        <span className="min-w-0 truncate text-fg">{portalUser.email}</span>
                        <Badge tone={portalUser.is_active === 1 ? 'success' : 'neutral'}>
                          {portalUser.is_active === 1 ? 'Actif' : 'Inactif'}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </aside>
        </div>
      )}
    </>
  );
}
