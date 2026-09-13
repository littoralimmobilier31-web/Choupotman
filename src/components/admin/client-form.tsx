'use client';

import * as React from 'react';
import { Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { ConfirmDialog } from '@/components/ui/modal';
import { useResourceForm } from './use-resource-form';

/**
 * Client create / edit form.
 *
 * Shared by both screens: passing `clientId` switches it from POST to PATCH and
 * enables the delete action. Empty optional strings are sent as `null` so a
 * cleared field actually clears in the database rather than storing "".
 */

export type ClientFormValues = {
  name: string;
  company: string;
  email: string;
  phone: string;
  whatsapp: string;
  country: string;
  city: string;
  address: string;
  website: string;
  tax_id: string;
  currency: string;
  preferred_locale: 'fr' | 'ar' | 'en';
  status: 'active' | 'inactive' | 'archived';
  source: string;
  notes: string;
  linkedin: string;
  instagram: string;
  facebook: string;
};

export const EMPTY_CLIENT: ClientFormValues = {
  name: '', company: '', email: '', phone: '', whatsapp: '', country: '', city: '',
  address: '', website: '', tax_id: '', currency: 'DZD', preferred_locale: 'fr',
  status: 'active', source: 'manual', notes: '', linkedin: '', instagram: '', facebook: '',
};

const CURRENCIES = ['DZD', 'EUR', 'USD', 'MAD', 'TND', 'GBP', 'CAD', 'AED', 'SAR'];

const SOURCES = [
  { value: 'manual', label: 'Saisie manuelle' },
  { value: 'contact_form', label: 'Formulaire de contact' },
  { value: 'project_request', label: 'Demande de projet' },
  { value: 'chatbot', label: 'Chatbot IA' },
  { value: 'referral', label: 'Recommandation' },
  { value: 'social', label: 'Réseaux sociaux' },
  { value: 'brief', label: 'Brief client' },
  { value: 'other', label: 'Autre' },
];

export function ClientForm({
  csrf,
  initial,
  clientId,
  canDelete = false,
}: {
  csrf: string;
  initial?: ClientFormValues;
  clientId?: number;
  canDelete?: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const form = useResourceForm<ClientFormValues>({
    initial: initial ?? EMPTY_CLIENT,
    endpoint: clientId ? `/api/clients/${clientId}` : '/api/clients',
    method: clientId ? 'PATCH' : 'POST',
    csrf,
    successMessage: clientId ? 'Client mis à jour.' : 'Client créé.',
    redirectTo: clientId ? undefined : (payload) => `/espace-admin/clients/${payload.id}`,
    deleteEndpoint: clientId ? `/api/clients/${clientId}` : undefined,
    deleteRedirectTo: '/espace-admin/clients',
    // An empty optional field must clear the column, not store an empty string.
    transform: (values) => ({
      name: values.name,
      company: values.company || null,
      email: values.email || null,
      phone: values.phone || null,
      whatsapp: values.whatsapp || null,
      country: values.country || null,
      city: values.city || null,
      address: values.address || null,
      website: values.website || null,
      tax_id: values.tax_id || null,
      currency: values.currency,
      preferred_locale: values.preferred_locale,
      status: values.status,
      source: values.source || null,
      notes: values.notes || null,
      social: {
        linkedin: values.linkedin || null,
        instagram: values.instagram || null,
        facebook: values.facebook || null,
      },
    }),
  });

  const { values, set, fieldErrors } = form;

  return (
    <form onSubmit={form.submit} className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Identité</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-4 pt-3 sm:grid-cols-2">
          <Field label="Nom du contact" required htmlFor="c-name" error={fieldErrors.name}>
            <Input id="c-name" value={values.name} onChange={(e) => set('name', e.target.value)} maxLength={120} autoFocus />
          </Field>
          <Field label="Entreprise" htmlFor="c-company" error={fieldErrors.company}>
            <Input id="c-company" value={values.company} onChange={(e) => set('company', e.target.value)} maxLength={140} />
          </Field>
          <Field label="Email" htmlFor="c-email" error={fieldErrors.email}>
            <Input id="c-email" type="email" inputMode="email" value={values.email} onChange={(e) => set('email', e.target.value)} maxLength={180} />
          </Field>
          <Field label="Téléphone" htmlFor="c-phone" error={fieldErrors.phone}>
            <Input id="c-phone" type="tel" inputMode="tel" value={values.phone} onChange={(e) => set('phone', e.target.value)} maxLength={40} />
          </Field>
          <Field label="WhatsApp" htmlFor="c-whatsapp" hint="si différent">
            <Input id="c-whatsapp" type="tel" value={values.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} maxLength={40} />
          </Field>
          <Field label="Site web" htmlFor="c-website">
            <Input id="c-website" type="url" inputMode="url" placeholder="https://" value={values.website} onChange={(e) => set('website', e.target.value)} maxLength={200} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Localisation & facturation</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-4 pt-3 sm:grid-cols-2">
          <Field label="Pays" htmlFor="c-country">
            <Input id="c-country" value={values.country} onChange={(e) => set('country', e.target.value)} maxLength={80} />
          </Field>
          <Field label="Ville" htmlFor="c-city">
            <Input id="c-city" value={values.city} onChange={(e) => set('city', e.target.value)} maxLength={80} />
          </Field>
          <Field label="Adresse" htmlFor="c-address" className="sm:col-span-2">
            <Textarea id="c-address" rows={2} value={values.address} onChange={(e) => set('address', e.target.value)} maxLength={300} />
          </Field>
          <Field label="Identifiant fiscal (NIF)" htmlFor="c-tax" hint="apparaît sur les documents">
            <Input id="c-tax" value={values.tax_id} onChange={(e) => set('tax_id', e.target.value)} maxLength={60} />
          </Field>
          <Field label="Devise de facturation" htmlFor="c-currency">
            <Select id="c-currency" value={values.currency} onChange={(e) => set('currency', e.target.value)}>
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Suivi</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-4 pt-3 sm:grid-cols-3">
          <Field label="Statut" htmlFor="c-status">
            <Select id="c-status" value={values.status} onChange={(e) => set('status', e.target.value as ClientFormValues['status'])}>
              <option value="active">Actif</option>
              <option value="inactive">Inactif</option>
              <option value="archived">Archivé</option>
            </Select>
          </Field>
          <Field label="Origine" htmlFor="c-source">
            <Select id="c-source" value={values.source} onChange={(e) => set('source', e.target.value)}>
              {SOURCES.map((source) => (
                <option key={source.value} value={source.value}>
                  {source.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Langue de communication" htmlFor="c-locale">
            <Select
              id="c-locale"
              value={values.preferred_locale}
              onChange={(e) => set('preferred_locale', e.target.value as ClientFormValues['preferred_locale'])}
            >
              <option value="fr">Français</option>
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </Select>
          </Field>
          <Field label="Notes internes" htmlFor="c-notes" className="sm:col-span-3" hint="non visible par le client">
            <Textarea id="c-notes" rows={4} value={values.notes} onChange={(e) => set('notes', e.target.value)} maxLength={4000} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Réseaux sociaux</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-4 pt-3 sm:grid-cols-3">
          <Field label="LinkedIn" htmlFor="c-linkedin">
            <Input id="c-linkedin" type="url" placeholder="https://" value={values.linkedin} onChange={(e) => set('linkedin', e.target.value)} maxLength={200} />
          </Field>
          <Field label="Instagram" htmlFor="c-instagram">
            <Input id="c-instagram" type="url" placeholder="https://" value={values.instagram} onChange={(e) => set('instagram', e.target.value)} maxLength={200} />
          </Field>
          <Field label="Facebook" htmlFor="c-facebook">
            <Input id="c-facebook" type="url" placeholder="https://" value={values.facebook} onChange={(e) => set('facebook', e.target.value)} maxLength={200} />
          </Field>
        </CardBody>
      </Card>

      {form.error && (
        <p className="rounded-lg bg-danger-soft px-3 py-2.5 text-[0.8125rem] font-medium text-danger" role="alert">
          {form.error}
        </p>
      )}

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <Button type="submit" disabled={form.busy || values.name.trim().length < 2}>
          <Save className="size-4" />
          {form.busy ? 'Enregistrement…' : clientId ? 'Enregistrer' : 'Créer le client'}
        </Button>

        {form.dirty && <span className="text-[0.75rem] text-warning">Modifications non enregistrées</span>}

        {canDelete && clientId && (
          <Button
            type="button"
            variant="ghost"
            className="ms-auto text-danger hover:bg-danger-soft"
            onClick={() => setConfirmDelete(true)}
            disabled={form.deleting}
          >
            <Trash2 className="size-4" />
            Supprimer
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false);
          await form.remove();
        }}
        title="Supprimer ce client ?"
        message="Si le client a des projets ou des factures, il sera archivé au lieu d’être supprimé afin de conserver l’historique comptable."
        confirmLabel="Supprimer"
        busy={form.deleting}
      />
    </form>
  );
}
