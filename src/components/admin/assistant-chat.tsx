'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, Loader2, Send, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';

/**
 * Choupotman AI — the private assistant.
 *
 * A proposed action is rendered as a distinct card with an explicit description
 * of what confirming would do, and nothing happens until the owner presses
 * "Confirmer". That mirrors the server: the action is stored as a proposal and
 * only the confirmation endpoint can execute it, so the interface cannot be the
 * weak point.
 */

type Proposal = { messageId: number; name: string; preview: string };

type Entry =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string; source?: 'ai' | 'rules'; toolsUsed?: string[] }
  | { kind: 'proposal'; proposal: Proposal; status: 'pending' | 'done' | 'cancelled'; result?: string };

const STARTERS = [
  'Où en est mon activité cette semaine ?',
  'Quelles factures dois-je relancer en priorité ?',
  'Quels projets risquent de déraper ?',
  'Quels prospects relancer ?',
];

export function AssistantChat({
  csrf,
  aiConfigured,
  ownerName,
}: {
  csrf: string;
  aiConfigured: boolean;
  ownerName: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const [input, setInput] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [conversationId, setConversationId] = React.useState<number | null>(null);
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [entries, busy]);

  const ask = async (question: string) => {
    const text = question.trim();
    if (text.length === 0 || busy) return;

    setEntries((current) => [...current, { kind: 'user', text }]);
    setInput('');
    setBusy(true);

    try {
      const response = await fetch('/api/ia/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ message: text, conversationId, surface: 'admin', csrf }),
      });

      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        conversationId?: number;
        reply?: string;
        proposals?: Proposal[];
        toolsUsed?: string[];
        source?: 'ai' | 'rules';
      };

      if (!response.ok) throw new Error(result.error ?? 'L’assistant n’a pas répondu.');

      if (result.conversationId) setConversationId(result.conversationId);

      setEntries((current) => [
        ...current,
        { kind: 'assistant', text: result.reply ?? '', source: result.source, toolsUsed: result.toolsUsed },
        ...(result.proposals ?? []).map(
          (proposal): Entry => ({ kind: 'proposal', proposal, status: 'pending' }),
        ),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'L’assistant n’a pas répondu.');
      setEntries((current) => [
        ...current,
        { kind: 'assistant', text: 'Je n’ai pas pu répondre. Réessayez dans un instant.' },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const decide = async (messageId: number, confirm: boolean) => {
    setBusy(true);
    try {
      const response = await fetch('/api/ia/confirmer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ messageId, confirm, csrf }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        executed?: boolean;
        result?: string;
      };
      if (!response.ok) throw new Error(result.error ?? 'Action impossible.');

      setEntries((current) =>
        current.map((entry) =>
          entry.kind === 'proposal' && entry.proposal.messageId === messageId
            ? { ...entry, status: confirm ? 'done' : 'cancelled', result: result.result }
            : entry,
        ),
      );

      if (confirm) {
        toast.success('Action effectuée.');
        // The action changed real data; refresh the surrounding admin.
        router.refresh();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Action impossible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-[calc(100dvh-13rem)] min-h-96 flex-col rounded-[var(--radius-card)] border border-line bg-surface-raised">
      <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
        {entries.length === 0 && (
          <div className="py-8 text-center">
            <span className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-accent-soft text-accent">
              <Sparkles className="size-5" />
            </span>
            <p className="text-[0.9375rem] font-semibold text-fg">Choupotman AI</p>
            <p className="mx-auto mt-2 max-w-md text-[0.8125rem] leading-relaxed text-fg-muted">
              Posez une question sur votre activité. L’assistant lit vos données réelles — projets,
              factures, prospects — et ne répond jamais de mémoire. Toute action qui modifie
              quelque chose vous est soumise avant d’être exécutée.
            </p>

            {!aiConfigured && (
              <p className="mx-auto mt-4 max-w-md rounded-lg bg-warning-soft px-3 py-2.5 text-[0.75rem] leading-relaxed text-warning">
                Aucune clé API n’est configurée : l’assistant répond avec un rapport calculé depuis vos
                données, sans conversation. Ajoutez <code>ANTHROPIC_API_KEY</code> pour l’activer
                complètement.
              </p>
            )}

            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {STARTERS.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => ask(starter)}
                  className="rounded-full border border-line bg-surface px-3 py-1.5 text-[0.75rem] text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
                >
                  {starter}
                </button>
              ))}
            </div>
          </div>
        )}

        {entries.map((entry, index) => {
          if (entry.kind === 'user') {
            return (
              <div key={index} className="flex justify-end">
                <p className="max-w-[85%] whitespace-pre-line rounded-2xl rounded-br-md bg-accent px-3.5 py-2.5 text-[0.8125rem] leading-relaxed text-accent-fg">
                  {entry.text}
                </p>
              </div>
            );
          }

          if (entry.kind === 'assistant') {
            return (
              <div key={index} className="flex justify-start">
                <div className="max-w-[90%]">
                  <p className="whitespace-pre-line rounded-2xl rounded-bl-md bg-surface-sunken px-3.5 py-2.5 text-[0.8125rem] leading-relaxed text-fg">
                    {entry.text}
                  </p>
                  {(entry.source === 'rules' || (entry.toolsUsed?.length ?? 0) > 0) && (
                    <p className="mt-1.5 ps-1 text-[0.625rem] text-fg-subtle">
                      {entry.source === 'rules' && 'Calculé depuis vos données, sans modèle. '}
                      {(entry.toolsUsed?.length ?? 0) > 0 && `Données lues : ${entry.toolsUsed!.join(', ')}.`}
                    </p>
                  )}
                </div>
              </div>
            );
          }

          return <ProposalCard key={index} entry={entry} busy={busy} onDecide={decide} />;
        })}

        {busy && (
          <div className="flex items-center gap-2 text-[0.75rem] text-fg-subtle">
            <Loader2 className="size-3.5 animate-spin" />
            L’assistant consulte vos données…
          </div>
        )}

        <div ref={endRef} />
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          ask(input);
        }}
        className="flex items-end gap-2 border-t border-line p-3"
      >
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends, Shift+Enter adds a line — the convention people expect.
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              ask(input);
            }
          }}
          rows={2}
          maxLength={6000}
          placeholder={`Demandez quelque chose sur l’activité de ${ownerName}…`}
          aria-label="Votre question"
          className="text-[0.8125rem]"
        />
        <Button type="submit" disabled={busy || input.trim().length === 0} className="shrink-0">
          <Send className="size-4 rtl:-scale-x-100" />
          <span className="sr-only sm:not-sr-only">Envoyer</span>
        </Button>
      </form>
    </div>
  );
}

function ProposalCard({
  entry,
  busy,
  onDecide,
}: {
  entry: Extract<Entry, { kind: 'proposal' }>;
  busy: boolean;
  onDecide: (messageId: number, confirm: boolean) => void;
}) {
  const { proposal, status, result } = entry;

  return (
    <div
      className={cn(
        'rounded-lg border p-3.5',
        status === 'pending' && 'border-warning/40 bg-warning-soft',
        status === 'done' && 'border-success/40 bg-success-soft',
        status === 'cancelled' && 'border-line bg-surface-sunken',
      )}
    >
      <p className="flex items-start gap-2 text-[0.8125rem] font-semibold text-fg">
        {status === 'pending' && <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />}
        {status === 'done' && <Check className="mt-0.5 size-4 shrink-0 text-success" />}
        {status === 'cancelled' && <X className="mt-0.5 size-4 shrink-0 text-fg-subtle" />}
        {status === 'pending'
          ? 'Confirmation requise'
          : status === 'done'
            ? 'Action effectuée'
            : 'Action annulée'}
      </p>

      <p className="mt-1.5 ps-6 text-[0.8125rem] leading-relaxed text-fg">{proposal.preview}</p>

      {status === 'pending' && (
        <>
          <p className="mt-1 ps-6 text-[0.6875rem] text-fg-muted">
            Rien n’a encore été modifié. L’assistant n’exécute aucune action sans votre accord.
          </p>
          <div className="mt-3 flex gap-2 ps-6">
            <Button size="sm" disabled={busy} onClick={() => onDecide(proposal.messageId, true)}>
              <Check className="size-3.5" />
              Confirmer
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => onDecide(proposal.messageId, false)}
            >
              Annuler
            </Button>
          </div>
        </>
      )}

      {result && status !== 'pending' && (
        <p className="mt-1.5 ps-6 text-[0.75rem] text-fg-muted">{result}</p>
      )}
    </div>
  );
}
