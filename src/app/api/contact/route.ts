import { headers } from 'next/headers';
import { contactSchema, fieldErrors, formToObject, projectRequestSchema } from '@/lib/validation/public';
import { clientIp, rateLimit, tooManyRequests } from '@/lib/auth/rate-limit';
import { isSameOrigin } from '@/lib/auth/csrf';
import { saveUpload, UploadError } from '@/lib/storage';
import * as commsRepo from '@/lib/db/repositories/comms';
import * as filesRepo from '@/lib/db/repositories/files';
import { recordConversion, visitorKey } from '@/lib/db/repositories/analytics';
import { logActivity } from '@/lib/db/repositories/activity';
import { emit } from '@/lib/automation/engine';
import { safeJson } from '@/lib/utils';

/**
 * Public contact endpoint.
 *
 * Defence in depth, in order: same-origin check → rate limit per IP → honeypot →
 * schema validation → optional file validation. Only then is anything written.
 *
 * The submission is stored verbatim and the automation engine turns it into a CRM
 * lead, queues the acknowledgement and notifies the admin — so the funnel is
 * identical whether the entry point is this form, the wizard or the chatbot.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Shared handler: the project-request wizard posts the same shape with more text. */
export async function handleSubmission(
  request: Request,
  source: 'contact_form' | 'project_request',
): Promise<Response> {
  if (!isSameOrigin(request)) {
    return Response.json({ error: 'Requête refusée.' }, { status: 403 });
  }

  const ip = clientIp(request);
  const limit = rateLimit(source === 'contact_form' ? 'contact' : 'projectRequest', ip);
  if (!limit.allowed) return tooManyRequests(limit);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: 'Données illisibles.' }, { status: 400 });
  }

  const raw = formToObject(form);
  const schema = source === 'contact_form' ? contactSchema : projectRequestSchema;
  const parsed = schema.safeParse(raw);

  if (!parsed.success) {
    const fields = fieldErrors(parsed.error);
    // A filled honeypot is a bot: answer 200 so it learns nothing, write nothing.
    if (fields.website) return Response.json({ ok: true });
    return Response.json(
      { error: 'Merci de corriger les champs indiqués.', fields },
      { status: 400 },
    );
  }

  const data = parsed.data;
  if (data.website && data.website.length > 0) return Response.json({ ok: true });

  // Optional attachment
  let fileId: number | null = null;
  const upload = form.get('file');
  if (upload instanceof File && upload.size > 0) {
    try {
      const stored = await saveUpload(upload, { allowedKinds: ['image', 'document', 'archive'] });
      fileId = filesRepo.createFile({
        originalName: stored.originalName,
        storedName: stored.storedName,
        mimeType: stored.mimeType,
        extension: stored.extension,
        sizeBytes: stored.sizeBytes,
        checksum: stored.checksum,
        entityType: 'contact_submission',
      });
    } catch (error) {
      const message = error instanceof UploadError ? error.message : 'Fichier refusé.';
      return Response.json({ error: message, fields: { file: message } }, { status: 400 });
    }
  }

  const headerList = await headers();
  const userAgent = headerList.get('user-agent');

  const submissionId = commsRepo.createContactSubmission({
    name: data.name,
    email: data.email,
    phone: data.phone || null,
    company: data.company || null,
    service: data.service || null,
    budget: data.budget || null,
    deadline: data.deadline || null,
    message: data.message,
    fileId,
    locale: data.locale,
    source,
    // The wizard sends its full answer object as a JSON string; a malformed value
    // is stored as null rather than rejecting an otherwise valid submission.
    payload: raw.payload ? safeJson<unknown>(raw.payload, null) : null,
    ip,
    userAgent,
  });

  // Lead creation, acknowledgement and notification all live in one rule, so
  // every entry point behaves the same way.
  const outcomes = emit('contact.received', { submissionId, source });

  recordConversion({
    kind: source === 'contact_form' ? 'contact_form' : 'project_request',
    entityType: 'contact_submission',
    entityId: submissionId,
    visitorKey: visitorKey(ip, userAgent),
  });

  logActivity({
    action: 'create',
    actorLabel: data.name,
    entityType: 'contact_submission',
    entityId: submissionId,
    entityLabel: data.email,
    summary: `Nouvelle demande reçue (${source})`,
    metadata: { source, automations: outcomes.map((o) => o.automation) },
    ip,
  });

  return Response.json({ ok: true, submissionId });
}

export async function POST(request: Request): Promise<Response> {
  return handleSubmission(request, 'contact_form');
}
