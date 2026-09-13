import { handleSubmission } from '../contact/route';

/**
 * Project-request wizard endpoint.
 *
 * Same pipeline as the contact form (validation, rate limit, lead creation) with
 * its own rate-limit bucket and a `project_request` source, so the two funnels
 * can be reported on separately without duplicating the logic.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  return handleSubmission(request, 'project_request');
}
