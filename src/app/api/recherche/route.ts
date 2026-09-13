import { apiUser } from '@/lib/auth/guard';
import { search, searchFacets, type SearchEntityType } from '@/lib/db/repositories/search';
import { canAccessResource, type Resource } from '@/lib/auth/permissions';

/**
 * Global search (Ctrl+K).
 *
 * Results are filtered by permission after the query: a Finance user searching
 * "Atlas" gets the client and its invoices, not the blog post — so the palette
 * can never surface a record the user would be redirected away from.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Which permission resource gates each indexed entity type. */
const ENTITY_RESOURCE: Record<SearchEntityType, Resource> = {
  client: 'clients',
  project: 'projects',
  task: 'tasks',
  invoice: 'invoices',
  quote: 'quotes',
  contract: 'contracts',
  file: 'files',
  message: 'messages',
  post: 'blog',
  portfolio: 'portfolio',
  case_study: 'case_studies',
  lead: 'leads',
  service: 'services',
  brief: 'briefs',
  moodboard: 'moodboards',
  expense: 'expenses',
  subscription: 'subscriptions',
};

export async function GET(request: Request): Promise<Response> {
  const auth = await apiUser();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const query = (url.searchParams.get('q') ?? '').trim();
  const typeParam = url.searchParams.get('type');
  const wantFacets = url.searchParams.get('facets') === '1';

  if (query.length < 2) return Response.json({ results: [], facets: [] });

  // Restrict the query to the types this user may see.
  const allowedTypes = (Object.keys(ENTITY_RESOURCE) as SearchEntityType[]).filter((type) =>
    canAccessResource(auth.user, ENTITY_RESOURCE[type]),
  );

  if (allowedTypes.length === 0) return Response.json({ results: [], facets: [] });

  const types =
    typeParam && allowedTypes.includes(typeParam as SearchEntityType)
      ? [typeParam as SearchEntityType]
      : allowedTypes;

  const results = search(query, { types, limit: 24 });

  return Response.json({
    results,
    facets: wantFacets
      ? searchFacets(query).filter((facet) => allowedTypes.includes(facet.type))
      : [],
  });
}
