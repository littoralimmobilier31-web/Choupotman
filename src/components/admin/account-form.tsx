'use client';

import * as React from 'react';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { useResourceForm } from './use-resource-form';

/**
 * The signed-in person's own profile.
 *
 * The username is shown but not editable: it is what appears in the activity
 * journal, and letting someone rename themselves would make a past entry read as
 * though a different person had done it. Changing it is an administrator's
 * action, recorded as such.
 */

export type AccountValues = {
  username: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  locale: string;
  theme: string;
};

export function AccountForm({ csrf, account }: { csrf: string; account: AccountValues }) {
  const form = useResourceForm<Record<string, string>>({
    initial: {
      full_name: account.full_name ?? '',
      email: account.email,
      phone: account.phone ?? '',
      locale: account.locale,
      theme: account.theme || 'system',
    },
    endpoint: '/api/mon-compte',
    method: 'PATCH',
    csrf,
    successMessage: 'Profil enregistré.',
    transform: (values) => ({
      full_name: values.full_name.trim() || null,
      email: values.email.trim(),
      phone: values.phone.trim() || null,
      locale: values.locale,
      theme: values.theme,
    }),
  });

  return (
    <form onSubmit={form.submit}>
      <Card>
        <CardBody className="grid gap-3 sm:grid-cols-2">
          <Field label="Identifiant" htmlFor="ac-username" hint="Figure dans le journal d’activité et n’est pas modifiable ici.">
            <Input id="ac-username" value={account.username} readOnly disabled />
          </Field>

          <Field label="Adresse email" htmlFor="ac-email" required error={form.fieldErrors.email}>
            <Input
              id="ac-email"
              type="email"
              value={form.values.email}
              onChange={(event) => form.set('email', event.target.value)}
              maxLength={180}
            />
          </Field>

          <Field label="Nom complet" htmlFor="ac-fullname" error={form.fieldErrors.full_name}>
            <Input
              id="ac-fullname"
              value={form.values.full_name}
              onChange={(event) => form.set('full_name', event.target.value)}
              maxLength={160}
            />
          </Field>

          <Field label="Téléphone" htmlFor="ac-phone">
            <Input
              id="ac-phone"
              value={form.values.phone}
              onChange={(event) => form.set('phone', event.target.value)}
              maxLength={40}
            />
          </Field>

          <Field label="Langue de l’interface" htmlFor="ac-locale">
            <Select
              id="ac-locale"
              value={form.values.locale}
              onChange={(event) => form.set('locale', event.target.value)}
            >
              <option value="fr">Français</option>
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </Select>
          </Field>

          <Field label="Thème" htmlFor="ac-theme" hint="« Système » suit le réglage de votre appareil.">
            <Select id="ac-theme" value={form.values.theme} onChange={(event) => form.set('theme', event.target.value)}>
              <option value="system">Système</option>
              <option value="light">Clair</option>
              <option value="dark">Sombre</option>
            </Select>
          </Field>
        </CardBody>
      </Card>

      {form.error && (
        <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2.5 text-[0.8125rem] font-medium text-danger" role="alert">
          {form.error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={form.busy}>
          <Save className="size-4" />
          {form.busy ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
        {form.dirty && <span className="text-[0.75rem] text-warning">Modifications non enregistrées</span>}
      </div>
    </form>
  );
}
