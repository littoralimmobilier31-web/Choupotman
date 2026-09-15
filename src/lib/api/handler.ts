import 'server-only';
import type { z } from 'zod';
import { apiRequire, badRequest, notFound, serverError, type ApiFailure } from '@/lib/auth/guard';
import { assertCsrf, CsrfError } from '@/lib/auth/csrf';
import { clientIp, rateLimit, tooManyRequests } from '@/lib/auth/rate-limit';
import { fieldErrors } from '@/lib/validation/public';
import { logActivity, type ActivityAction } from '@/lib/db/repositories/activity';
import type { AuthUser } from '@/lib/db/types';
import type { Permission } from '@/lib/auth/permissions';

/**
 * Shared plumbing for admin API routes.
 *
 * Every mutating endpoint needs the same five things — permission check, CSRF
 * verification, rate limit, body validation, audit log — and getting any one of
 * them wrong is a security bug. Centralising them here means a new endpoint is a
 * schema plus a function body, and cannot accidentally skip a step.
 */

export type HandlerContext<TBody> = {
  user: AuthUser;
  body: TBody;
  request: Request;
  ip: string;
  /**
   * The parsed multipart body, for upload routes.
   *
   * A request body can only be read once, and this wrapper already reads it to
   * find the CSRF token — so the parsed `FormData` is handed over rather than
   * left for the handler to re-read and fail on. Present only for
   * `multipart/form-data`; the text fields are also in `body`.
   */
  form: FormData | null;
  /** Records an audit entry pre-filled with the acting user. */
  log: (entry: {
    action: ActivityAction | (string & {});
    entityType?: string;
    entityId?: number;
    entityLabel?: string;
    summary: string;
    metadata?: unknown;
  }) => void;
};

export type HandlerOptions<TSchema extends z.ZodTypeAny | undefined> = {
  permission: Permission | Permission[];
  schema?: TSchema;
  /** Mutating verbs require CSRF; GET does not. Defaults to true. */
  csrf?: boolean;
  /** Rate-limit bucket name; defaults to the generic API policy. */
  rateLimitPolicy?: 'api' | 'aiAdmin' | 'upload';
};

type Infer<TSchema> = TSchema extends z.ZodTypeAny ? z.infer<TSchema> : undefined;

/**
 * Wraps a route handler with auth, CSRF, rate limiting and validation.
 *
 * The returned function is what a route file exports; `fn` only ever runs on a
 * fully authorised, validated request.
 */
export function createHandler<TSchema extends z.ZodTypeAny | undefined = undefined>(
  options: HandlerOptions<TSchema>,
  fn: (context: HandlerContext<Infer<TSchema>>) => Promise<Response> | Response,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    try {
      const auth = await apiRequire(options.permission);
      if (!auth.ok) return (auth as ApiFailure).response;

      const ip = clientIp(request);
      const limit = rateLimit(options.rateLimitPolicy ?? 'api', `${auth.user.id}:${ip}`);
      if (!limit.allowed) return tooManyRequests(limit);

      const mutating = request.method !== 'GET' && request.method !== 'HEAD';
      let raw: unknown;
      let form: FormData | null = null;

      if (mutating) {
        const contentType = request.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
          raw = await request.json().catch(() => ({}));
        } else if (contentType.includes('form')) {
          form = await request.formData();
          // Only the text fields go through validation; files are handed to the
          // handler through `context.form`, where `saveUpload` vets them.
          raw = Object.fromEntries(
            [...form.entries()].filter(([, value]) => typeof value === 'string'),
          );
        } else {
          raw = {};
        }

        if (options.csrf !== false) {
          const token =
            typeof raw === 'object' && raw !== null && 'csrf' in raw
              ? String((raw as Record<string, unknown>).csrf)
              : null;
          await assertCsrf(request, token);
        }
      }

      let body = raw as Infer<TSchema>;
      if (options.schema) {
        const parsed = options.schema.safeParse(raw ?? {});
        if (!parsed.success) {
          return Response.json(
            { error: 'Données invalides.', fields: fieldErrors(parsed.error) },
            { status: 400 },
          );
        }
        body = parsed.data as Infer<TSchema>;
      }

      return await fn({
        user: auth.user,
        body,
        request,
        ip,
        form,
        log: (entry) =>
          logActivity({
            userId: auth.user.id,
            actorLabel: auth.user.username,
            ip,
            ...entry,
          }),
      });
    } catch (error) {
      if (error instanceof CsrfError) {
        return Response.json({ error: error.message }, { status: 403 });
      }
      // Never surface an internal message: it can leak paths, SQL and config.
      console.error('API handler failed', error);
      return serverError();
    }
  };
}

/** Reads and validates a positive integer route parameter. */
export function parseId(value: string | undefined): number | null {
  const id = Number.parseInt(value ?? '', 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Resolves a dynamic `[id]` segment, returning a 400/404 response when it is
 * missing or does not match an existing record.
 */
export async function withId<T>(
  params: Promise<{ id: string }>,
  find: (id: number) => T | null,
): Promise<{ ok: true; id: number; record: T } | { ok: false; response: Response }> {
  const { id: raw } = await params;
  const id = parseId(raw);
  if (id === null) return { ok: false, response: badRequest('Identifiant invalide.') };
  const record = find(id);
  if (record === null || record === undefined) return { ok: false, response: notFound() };
  return { ok: true, id, record };
}

/** Consistent success envelope. */
export function ok<T extends Record<string, unknown>>(payload: T = {} as T, status = 200): Response {
  return Response.json({ ok: true, ...payload }, { status });
}

/** Consistent list envelope with pagination metadata. */
export function list<T>(items: T[], meta?: { total?: number; page?: number; pageSize?: number }): Response {
  return Response.json({
    ok: true,
    items,
    total: meta?.total ?? items.length,
    page: meta?.page ?? 1,
    pageSize: meta?.pageSize ?? items.length,
  });
}

export { badRequest, notFound, serverError };
