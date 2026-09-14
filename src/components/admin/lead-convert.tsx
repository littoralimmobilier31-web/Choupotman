'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Field, Input, Switch } from '@/components/ui/field';
import { useAction } from './use-resource-form';

/**
 * Lead → client conversion.
 *
 * The lead is kept and linked, never consumed, so the CRM can still say where a
 * client came from. Creating the project at the same time is the common case, so
 * it defaults to on and pre-fills the estimated value as the budget.
 */
export function LeadConvertButton({
  csrf,
  leadId,
  leadName,
  estimatedValue,
  currency,
  enabled,
}: {
  csrf: string;
  leadId: number;
  leadName: string;
  estimatedValue: number;
  currency: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const { run, busy } = useAction(csrf);
  const [open, setOpen] = React.useState(false);
  const [createProject, setCreateProject] = React.useState(true);
  const [title, setTitle] = React.useState(`${leadName} — nouveau projet`);
  const [budget, setBudget] = React.useState(estimatedValue > 0 ? String(estimatedValue) : '');

  if (!enabled) return <span className="text-[0.6875rem] text-fg-subtle">—</span>;

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="size-3.5" />
        Convertir
      </Button>

      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title={`Convertir « ${leadName} » en client`}
          description="Le prospect est conservé et rattaché au client créé, afin de garder la trace de son origine."
          size="md"
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button
                disabled={busy}
                onClick={async () => {
                  const result = await run<{ clientId: number; projectId: number | null }>(
                    `/api/prospects/${leadId}/convertir`,
                    {
                      method: 'POST',
                      body: {
                        createProject,
                        projectTitle: createProject ? title.trim() : null,
                        budget: createProject ? Number(budget) || 0 : undefined,
                      },
                      success: 'Prospect converti.',
                    },
                  );
                  if (result) {
                    setOpen(false);
                    router.push(
                      result.projectId
                        ? `/espace-admin/projets/${result.projectId}`
                        : `/espace-admin/clients/${result.clientId}`,
                    );
                  }
                }}
              >
                Convertir
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg bg-surface-sunken px-3 py-2.5">
              <div className="min-w-0 max-w-sm">
                <p className="text-[0.8125rem] font-semibold text-fg">Créer aussi le projet</p>
                <p className="mt-1 text-[0.75rem] leading-relaxed text-fg-muted">
                  Les étapes de production, les tâches de démarrage et l’arborescence de dossiers seront générées.
                </p>
              </div>
              <Switch
                checked={createProject}
                onChange={setCreateProject}
                label={createProject ? 'Oui' : 'Non'}
              />
            </div>

            {createProject && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Titre du projet" htmlFor="lc-title" className="sm:col-span-2">
                  <Input id="lc-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} />
                </Field>
                <Field label={`Budget (${currency})`} htmlFor="lc-budget">
                  <Input
                    id="lc-budget"
                    type="number"
                    min={0}
                    step="0.01"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    className="tabular-nums"
                  />
                </Field>
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
