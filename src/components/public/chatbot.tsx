'use client';

import * as React from 'react';
import { Bot, Send, X, Sparkles, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Locale } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n/types';

/**
 * Public AI assistant.
 *
 * A floating panel that talks to `POST /api/chat`. The server answers strictly
 * from database content (services, projects, pricing) and can open a lead — the
 * widget itself holds no knowledge, so it can never contradict the CMS.
 *
 * The transcript is kept in `sessionStorage` only, so reopening the site does not
 * resurrect a stale conversation and nothing personal persists on the device.
 */

type ChatRole = 'user' | 'assistant';
type ChatMessage = { id: string; role: ChatRole; content: string; pending?: boolean };

const STORAGE_KEY = 'chp-chat';

export function Chatbot({
  locale,
  dict,
  greeting,
  assistantName,
}: {
  locale: Locale;
  dict: Dictionary;
  greeting?: string | null;
  assistantName?: string | null;
}) {
  const [open, setOpen] = React.useState(false);
  const [input, setInput] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const listRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  const openingLine = greeting?.trim() || dict.chatbot.greeting;

  // Restore the in-tab transcript.
  React.useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ChatMessage[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
          return;
        }
      }
    } catch {
      // Storage blocked — start fresh.
    }
    setMessages([{ id: 'greeting', role: 'assistant', content: openingLine }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (messages.length === 0) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30)));
    } catch {
      // Non-fatal.
    }
  }, [messages]);

  // Keep the newest message in view.
  React.useEffect(() => {
    if (!open) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open, busy]);

  React.useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const send = React.useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || busy) return;

      const userMessage: ChatMessage = { id: `u_${Date.now()}`, role: 'user', content };
      const history = [...messages, userMessage];
      setMessages(history);
      setInput('');
      setBusy(true);
      setError(null);

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            locale,
            messages: history
              .filter((m) => m.id !== 'greeting')
              .slice(-12)
              .map((m) => ({ role: m.role, content: m.content })),
          }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error ?? dict.common.error);
        }

        const payload = (await response.json()) as { reply: string; leadCaptured?: boolean };
        setMessages((prev) => [
          ...prev,
          { id: `a_${Date.now()}`, role: 'assistant', content: payload.reply },
          ...(payload.leadCaptured
            ? [{ id: `c_${Date.now()}`, role: 'assistant' as const, content: dict.chatbot.leadCaptured }]
            : []),
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : dict.common.error);
      } finally {
        setBusy(false);
      }
    },
    [busy, dict.chatbot.leadCaptured, dict.common.error, locale, messages],
  );

  const showSuggestions = messages.filter((m) => m.role === 'user').length === 0;

  return (
    <>
      {/* Launcher */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? dict.chatbot.close : dict.chatbot.open}
        className={cn(
          'fixed bottom-5 end-5 z-50 inline-flex items-center gap-2.5 rounded-full bg-accent px-4 py-3 text-accent-fg shadow-raised',
          'transition-transform duration-200 hover:scale-105 active:scale-95',
          open && 'scale-0 opacity-0',
        )}
      >
        <Bot className="size-5" />
        <span className="hidden text-[0.8125rem] font-semibold sm:inline">{dict.chatbot.title}</span>
        <span className="absolute inset-0 rounded-full animate-pulse-ring" aria-hidden />
      </button>

      {/* Panel */}
      {open && (
        <div
          className={cn(
            'fixed inset-x-3 bottom-3 z-50 flex max-h-[min(34rem,calc(100dvh-1.5rem))] flex-col overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-raised',
            'animate-scale-in sm:inset-x-auto sm:end-5 sm:bottom-5 sm:w-[24rem]',
          )}
          role="dialog"
          aria-label={dict.chatbot.title}
        >
          <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <Sparkles className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[0.8125rem] font-semibold text-fg">
                  {assistantName?.trim() || dict.chatbot.title}
                </p>
                <p className="truncate text-[0.6875rem] text-fg-subtle">{dict.chatbot.subtitle}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={dict.chatbot.close}
              className="shrink-0 rounded-md p-1 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
            >
              <X className="size-4" />
            </button>
          </header>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.map((message) => (
              <Bubble key={message.id} role={message.role} content={message.content} />
            ))}

            {busy && (
              <div className="flex items-center gap-2 ps-9">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="size-1.5 rounded-full bg-fg-subtle"
                    style={{ animation: `bounce-dot 1.2s ${i * 0.15}s infinite ease-in-out` }}
                  />
                ))}
                <span className="text-[0.6875rem] text-fg-subtle">{dict.chatbot.thinking}</span>
              </div>
            )}

            {error && (
              <p className="rounded-lg bg-danger-soft px-3 py-2 text-[0.75rem] text-danger" role="alert">
                {error}
              </p>
            )}

            {showSuggestions && !busy && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {dict.chatbot.suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => send(suggestion)}
                    className="rounded-full border border-line px-2.5 py-1 text-[0.6875rem] text-fg-muted transition-colors hover:border-accent hover:text-accent"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); send(input); }}
            className="shrink-0 border-t border-line p-3"
          >
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                rows={1}
                maxLength={1200}
                placeholder={dict.chatbot.placeholder}
                aria-label={dict.chatbot.placeholder}
                className="max-h-24 min-h-9 flex-1 resize-none rounded-lg border border-line bg-surface px-3 py-2 text-[0.8125rem] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
              <button
                type="submit"
                disabled={busy || input.trim() === ''}
                aria-label={dict.chatbot.send}
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-fg transition-opacity disabled:opacity-40"
              >
                <Send className="size-4 rtl:-scale-x-100" />
              </button>
            </div>
            <p className="mt-2 text-[0.625rem] leading-snug text-fg-subtle">{dict.chatbot.disclaimer}</p>
          </form>
        </div>
      )}
    </>
  );
}

function Bubble({ role, content }: { role: ChatRole; content: string }) {
  const isUser = role === 'user';
  return (
    <div className={cn('flex gap-2.5', isUser && 'flex-row-reverse')}>
      <span
        className={cn(
          'mt-0.5 flex size-6.5 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-surface-sunken text-fg-subtle' : 'bg-accent-soft text-accent',
        )}
        style={{ width: 26, height: 26 }}
        aria-hidden
      >
        {isUser ? <User className="size-3.5" /> : <Bot className="size-3.5" />}
      </span>
      <div
        className={cn(
          'max-w-[16rem] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[0.8125rem] leading-relaxed',
          isUser
            ? 'rounded-se-sm bg-accent text-accent-fg'
            : 'rounded-ss-sm bg-surface-sunken text-fg',
        )}
      >
        {content}
      </div>
    </div>
  );
}
