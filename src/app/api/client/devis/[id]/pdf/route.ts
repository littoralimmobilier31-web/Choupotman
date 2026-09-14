import { apiClientUser } from '@/lib/auth/guard';
import { portalQuote } from '@/lib/db/portal';
import { renderQuotePdf } from '@/lib/pdf/finance';
import { pdfResponse } from '@/lib/pdf/document';
import { logActivity } from '@/lib/db/repositories/activity';
import { clientIp } from '@/lib/auth/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Quote PDF for the client portal.
 *
 * Same ownership rule as the invoice route: `portalQuote` filters on the
 * caller's client id and hides drafts and archived quotes, so only a proposal
 * actually sent to this client can be retrieved.
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

  const quote = portalQuote(auth.clientUser.client_id, id);
  if (!quote) return Response.json({ error: 'Introuvable.' }, { status: 404 });

  const result = await renderQuotePdf(id);
  if (!result) return Response.json({ error: 'Introuvable.' }, { status: 404 });

  logActivity({
    actorLabel: auth.clientUser.email,
    action: 'export',
    entityType: 'quote',
    entityId: id,
    entityLabel: quote.number,
    summary: `Devis ${quote.number} téléchargé depuis l’espace client`,
    ip: clientIp(request),
  });

  return pdfResponse(result.bytes, result.filename, true);
}
