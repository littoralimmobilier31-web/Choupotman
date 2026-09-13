import { apiRequire } from '@/lib/auth/guard';
import { parseId } from '@/lib/api/handler';
import { renderContractPdf } from '@/lib/pdf/finance';
import { pdfResponse } from '@/lib/pdf/document';
import { logActivity } from '@/lib/db/repositories/activity';
import { clientIp } from '@/lib/auth/rate-limit';

/**
 * Contract PDF.
 *
 * `?inline=1` renders in the browser's viewer instead of downloading, which is
 * what the preview pane uses. Generation is logged: knowing when a document was
 * produced matters when a client disputes which version they received.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await apiRequire('contracts.view');
  if (!auth.ok) return auth.response;

  const id = parseId((await context.params).id);
  if (id === null) return Response.json({ error: 'Identifiant invalide.' }, { status: 400 });

  const result = await renderContractPdf(id);
  if (!result) return Response.json({ error: 'Contrat introuvable.' }, { status: 404 });

  const inline = new URL(request.url).searchParams.get('inline') === '1';

  logActivity({
    userId: auth.user.id,
    actorLabel: auth.user.username,
    action: 'export',
    entityType: 'contract',
    entityId: id,
    entityLabel: result.filename,
    summary: `PDF du contrat généré : ${result.filename}`,
    ip: clientIp(request),
  });

  return pdfResponse(result.bytes, result.filename, !inline);
}
