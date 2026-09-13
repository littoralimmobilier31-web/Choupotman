'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast';

/**
 * Shared form plumbing for every admin create/edit screen.
 *
 * Owns the parts that are identical everywhere and easy to get subtly wrong:
 * the CSRF header, per-field server errors, the busy flag, the success toast,
 * and the router refresh that makes the server-rendered list reflect the change.
 */

export type FormState<T> = {
  values: T;
  set: <K extends keyof T>(key: K, value: T[K]) => void;
  patch: (values: Partial<T>) => void;
  reset: (values?: T) => void;
  submit: (event?: React.FormEvent) => Promise<void>;
  remove: () => Promise<void>;
  busy: boolean;
  deleting: boolean;
  error: string | null;
  fieldErrors: Record<string, string>;
  dirty: boolean;
};

export type UseResourceFormOptions<T> = {
  initial: T;
  /** POST for create, PATCH for update. */
  endpoint: string;
  method?: 'POST' | 'PATCH' | 'PUT';
  csrf: string;
  /** Where to go on success; `refresh` re-renders in place. */
  onSuccess?: (payload: Record<string, unknown>) => void;
  redirectTo?: string | ((payload: Record<string, unknown>) => string);
  successMessage?: string;
  /** DELETE endpoint; enables `remove()`. */
  deleteEndpoint?: string;
  deleteRedirectTo?: string;
  /** Last chance to shape the payload (drop empty strings, coerce numbers…). */
  transform?: (values: T) => Record<string, unknown>;
};

export function useResourceForm<T extends Record<string, unknown>>(
  options: UseResourceFormOptions<T>,
): FormState<T> {
  const router = useRouter();
  const toast = useToast();
  const [values, setValues] = React.useState<T>(options.initial);
  const [busy, setBusy] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [dirty, setDirty] = React.useState(false);
  const initialRef = React.useRef(options.initial);

  const set = React.useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    // Clear the server error for this field as soon as the user edits it.
    setFieldErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key as string];
      return next;
    });
  }, []);

  const patch = React.useCallback((next: Partial<T>) => {
    setValues((prev) => ({ ...prev, ...next }));
    setDirty(true);
  }, []);

  const reset = React.useCallback((next?: T) => {
    setValues(next ?? initialRef.current);
    setDirty(false);
    setError(null);
    setFieldErrors({});
  }, []);

  const submit = React.useCallback(
    async (event?: React.FormEvent) => {
      event?.preventDefault();
      if (busy) return;

      setBusy(true);
      setError(null);
      setFieldErrors({});

      try {
        const payload = options.transform ? options.transform(values) : values;
        const response = await fetch(options.endpoint, {
          method: options.method ?? 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': options.csrf },
          body: JSON.stringify({ ...payload, csrf: options.csrf }),
        });

        const result = (await response.json().catch(() => ({}))) as Record<string, unknown> & {
          error?: string;
          fields?: Record<string, string>;
        };

        if (!response.ok) {
          if (result.fields) setFieldErrors(result.fields);
          throw new Error(result.error ?? 'Enregistrement impossible.');
        }

        setDirty(false);
        toast.success(options.successMessage ?? 'Enregistré.');
        options.onSuccess?.(result);

        const target =
          typeof options.redirectTo === 'function' ? options.redirectTo(result) : options.redirectTo;
        if (target) router.push(target);
        router.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Enregistrement impossible.';
        setError(message);
        toast.error(message);
      } finally {
        setBusy(false);
      }
    },
    [busy, options, router, toast, values],
  );

  const remove = React.useCallback(async () => {
    if (!options.deleteEndpoint || deleting) return;
    setDeleting(true);
    setError(null);

    try {
      const response = await fetch(options.deleteEndpoint, {
        method: 'DELETE',
        headers: { 'x-csrf-token': options.csrf },
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        archived?: boolean;
        cancelled?: boolean;
        reason?: string;
      };

      if (!response.ok) throw new Error(result.error ?? 'Suppression impossible.');

      // The API may archive or cancel instead of deleting — say which happened.
      if (result.archived || result.cancelled) {
        toast.info(result.archived ? 'Archivé' : 'Annulé', result.reason);
      } else {
        toast.success('Supprimé.');
      }

      if (options.deleteRedirectTo) router.push(options.deleteRedirectTo);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Suppression impossible.';
      setError(message);
      toast.error(message);
    } finally {
      setDeleting(false);
    }
  }, [deleting, options, router, toast]);

  // Warn before losing unsaved edits.
  React.useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      return '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  return { values, set, patch, reset, submit, remove, busy, deleting, error, fieldErrors, dirty };
}

/**
 * Fire-and-forget mutation helper for inline actions (toggle a status, delete a
 * row, move a kanban card) that do not need a whole form.
 */
export function useAction(csrf: string) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);

  const run = React.useCallback(
    async <T extends Record<string, unknown> = Record<string, unknown>>(
      endpoint: string,
      options: {
        method?: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
        body?: Record<string, unknown>;
        success?: string;
        /** Skip the router refresh when the caller updates local state itself. */
        silent?: boolean;
      } = {},
    ): Promise<T | null> => {
      if (busy) return null;
      setBusy(true);
      try {
        const method = options.method ?? 'POST';
        const response = await fetch(endpoint, {
          method,
          headers:
            method === 'DELETE'
              ? { 'x-csrf-token': csrf }
              : { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
          body: method === 'DELETE' ? undefined : JSON.stringify({ ...(options.body ?? {}), csrf }),
        });
        const result = (await response.json().catch(() => ({}))) as T & {
          error?: string;
          reason?: string;
          archived?: boolean;
          cancelled?: boolean;
        };

        if (!response.ok) throw new Error(result.error ?? 'Action impossible.');

        if (result.archived || result.cancelled) {
          toast.info(result.archived ? 'Archivé' : 'Annulé', result.reason);
        } else if (options.success) {
          toast.success(options.success);
        }

        if (!options.silent) router.refresh();
        return result;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Action impossible.');
        return null;
      } finally {
        setBusy(false);
      }
    },
    [busy, csrf, router, toast],
  );

  return { run, busy };
}
