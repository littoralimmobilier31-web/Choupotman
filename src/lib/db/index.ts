/**
 * Data-access entry point.
 *
 * Everything outside `lib/db` imports from here (or from a named repository
 * module) and never builds SQL of its own. Repositories are namespaced because
 * several of them legitimately export the same verbs — `listMessages` exists on
 * both `comms` and `ai`, `findService` reads better as `content.findService`.
 */

export { getDb, closeDb, migrate, all, one, run, scalar, transaction, hasFts } from './client';
export type { DB, MigrationResult } from './client';
export * from './types';

export * as settings from './repositories/settings';
export * as activity from './repositories/activity';
export * as searchIndex from './repositories/search';
export * as users from './repositories/users';
export * as clients from './repositories/clients';
export * as leads from './repositories/leads';
export * as projects from './repositories/projects';
export * as finance from './repositories/finance';
export * as content from './repositories/content';
export * as files from './repositories/files';
export * as comms from './repositories/comms';
export * as calendar from './repositories/calendar';
export * as expenses from './repositories/expenses';
export * as analytics from './repositories/analytics';
export * as briefs from './repositories/briefs';
export * as moodboards from './repositories/moodboards';
export * as ai from './repositories/ai';
export * as automations from './repositories/automations';
