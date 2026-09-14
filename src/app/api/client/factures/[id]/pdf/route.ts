import { apiClientUser } from '@/lib/auth/guard';
import { portalInvoice } from '@/lib/db/portal';
import { renderInvoicePdf } from '@/lib/pdf/finance';
import { pdfResponse } from '@/lib/pdf/document';
import { logActivity } from '@/lib/db/repositories/activity';
import { clientIp } from '@/lib/auth/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Invoice PDF for the client portal.
 *
 * Ownership is established before anything is rendered: `portalInvoice` filters
 * on the caller's own client id and excludes drafts, so a client can neither
 * fetch another client's invoice nor see one that has not been issued. Only
 * then is the same renderer the admin uses called, so both sides produce an
 * identical document.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await apiClientUser();
  if (!auth.ok) return auth.response;

  const { id: raw } = await context.params;
  const id = Number.parseInt(raw, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: 'Introuvable.' }, { status: 404 });
  }

  const invoice = portalInvoice(auth.clientUser.client_id, id);
  if (!invoice) return Response.json({ error: 'Introuvable.' }, { status: 404 });

  const result = await renderInvoicePdf(id);
  if (!result) return Response.json({ error: 'Introuvable.' }, { status: 404 });

  // Worth recording: it establishes when the client actually retrieved a copy.
  logActivity({
    actorLabel: auth.clientUser.email,
    action: 'export',
    entityType: 'invoice',
    entityId: id,
    entityLabel: invoice.number,
    summary: `Facture ${invoice.number} téléchargée depuis l’espace client`,
    ip: clientIp(request),
  });

  return pdfResponse(result.bytes, result.filename, true);
}
