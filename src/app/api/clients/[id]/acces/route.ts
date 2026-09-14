import { z } from 'zod';
import { createHandler, ok, badRequest, notFound, parseId } from '@/lib/api/handler';
import {
  createClientUser, findClient, findClientUserByEmail, issueTemporaryClientPassword,
  listClientUsers, setClientUserActive,
} from '@/lib/db/repositories/clients';
import { hashPassword, generateToken } from '@/lib/auth/password';
import { createMessage } from '@/lib/db/repositories/comms';
import { config } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const createSchema = z.object({
  csrf: z.string().optional(),
  email: z.string().trim().email('Adresse email invalide.').max(180),
  full_name: z.string().trim().max(160).optional().or(z.literal('')).nullable(),
});

const updateSchema = z.object({
  csrf: z.string().optional(),
  client_user_id: z.coerce.number().int().positive(),
  /** Deactivate an access without destroying the history behind it. */
  is_active: z.boolean().optional(),
  /** Issue a fresh temporary password. */
  reset_password: z.boolean().optional(),
});

export async function GET(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'clients.view' }, async () => {
    if (!findClient(id)) return notFound('Client introuvable.');
    // Never returns a hash — only what the admin screen needs to show.
    return Response.json({
      ok: true,
      users: listClientUsers(id).map((user) => ({
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        is_active: user.is_active,
        last_login_at: user.last_login_at,
        must_change_password: user.must_change_password,
      })),
    });
  })(request);
}

/**
 * Creates a portal access.
 *
 * A temporary password is generated server-side and returned **once**, in this
 * response, so the owner can pass it on. It is stored only as a hash, the
 * account is flagged `must_change_password`, and a ready-to-send draft is left
 * in the outbox — the message is never sent automatically, because sending
 * credentials is the owner's decision, not the system's.
 */
export async function POST(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler(
    { permission: 'clients.update', schema: createSchema },
    async ({ body, user, log }) => {
      const client = findClient(id);
      if (!client) return notFound('Client introuvable.');

      const existing = findClientUserByEmail(body.email);
      if (existing) {
        return Response.json(
          { error: 'Cette adresse dispose déjà d’un accès à l’espace client.' },
          { status: 409 },
        );
      }

      // 18 bytes of randomness: long enough that it cannot be guessed, short
      // enough to dictate over the phone.
      const temporaryPassword = generateToken(18);

      const clientUserId = createClientUser({
        clientId: id,
        email: body.email,
        fullName: body.full_name || client.name,
        passwordHash: await hashPassword(temporaryPassword),
        locale: client.preferred_locale,
      });

      const portalUrl = `${config.site.url}/client/connexion`;

      const messageId = createMessage({
        clientId: id,
        toName: body.full_name || client.name,
        toAddress: body.email,
        subject: 'Vos accès à l’espace client',
        body: [
          `Bonjour ${body.full_name || client.name},`,
          '',
          'Votre espace client est prêt. Vous pourrez y suivre l’avancement de vos projets,',
          'consulter vos documents et vos factures.',
          '',
          `Adresse : ${portalUrl}`,
          `Identifiant : ${body.email}`,
          `Mot de passe provisoire : ${temporaryPassword}`,
          '',
          'Ce mot de passe est à usage unique : il vous sera demandé d’en choisir un nouveau',
          'à votre première connexion.',
          '',
          'À bientôt,',
        ].join('\n'),
        status: 'draft',
        createdBy: user.id,
      });

      log({
        action: 'create',
        entityType: 'client_user',
        entityId: clientUserId,
        entityLabel: body.email,
        summary: `Accès à l’espace client créé pour ${client.company ?? client.name} (${body.email})`,
        // The password is never written to the audit log.
        metadata: { clientId: id, messageId },
      });

      return ok(
        {
          id: clientUserId,
          email: body.email,
          // Shown once and never retrievable again.
          temporaryPassword,
          portalUrl,
          messageId,
        },
        201,
      );
    },
  )(request);
}

export async function PATCH(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler(
    { permission: 'clients.update', schema: updateSchema },
    async ({ body, log }) => {
      const clientUser = listClientUsers(id).find((entry) => entry.id === body.client_user_id);
      if (!clientUser) return notFound('Accès introuvable.');

      let temporaryPassword: string | null = null;

      if (body.reset_password === true) {
        temporaryPassword = generateToken(18);
        // Flags the account for a change and revokes any live session.
        issueTemporaryClientPassword(clientUser.id, await hashPassword(temporaryPassword));
      }

      if (body.is_active !== undefined) {
        setClientUserActive(clientUser.id, body.is_active);
      }

      log({
        action: 'update',
        entityType: 'client_user',
        entityId: clientUser.id,
        entityLabel: clientUser.email,
        summary: temporaryPassword
          ? `Mot de passe de l’espace client réinitialisé pour ${clientUser.email}`
          : `Accès à l’espace client ${body.is_active ? 'réactivé' : 'désactivé'} pour ${clientUser.email}`,
      });

      return ok({ id: clientUser.id, temporaryPassword });
    },
  )(request);
}
