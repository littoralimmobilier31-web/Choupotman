import { createHandler, ok, badRequest, notFound } from '@/lib/api/handler';
import { aiConfirmSchema } from '@/lib/validation/admin';
import { executeTool, describeTool, findTool } from '@/lib/ai/assistant';
import * as aiRepo from '@/lib/db/repositories/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Executes — or rejects — an action the assistant proposed.
 *
 * This is the only place a write tool ever runs, and it runs on the payload
 * stored when the proposal was made, not on anything the browser sends back.
 * The request carries a message id and a yes/no, nothing else, so a tampered
 * request cannot change what gets done.
 *
 * A proposal can be acted on once: its status moves off `proposed`, and a second
 * attempt is refused.
 */
export const POST = createHandler(
  { permission: 'ai.create', schema: aiConfirmSchema, rateLimitPolicy: 'aiAdmin' },
  async ({ body, user, log }) => {
    const message = aiRepo.findMessage(body.messageId);
    if (!message || message.tool_name === null) return notFound('Action introuvable.');

    const conversation = aiRepo.findConversation(message.conversation_id);
    if (!conversation || conversation.user_id !== user.id) {
      return notFound('Action introuvable.');
    }

    if (message.tool_status !== 'proposed') {
      return badRequest('Cette action a déjà été traitée.');
    }

    const tool = findTool(message.tool_name);
    if (!tool) return badRequest('Cet outil n’existe plus.');

    const input = (message.payload ?? {}) as Record<string, unknown>;
    const preview = describeTool(message.tool_name, input);

    if (!body.confirm) {
      aiRepo.setToolStatus(body.messageId, 'rejected');
      aiRepo.addMessage({
        conversationId: message.conversation_id,
        role: 'assistant',
        content: 'Action annulée. Rien n’a été modifié.',
      });

      log({
        action: 'ai.action',
        entityType: 'ai',
        entityId: message.conversation_id,
        summary: `Action IA refusée : ${preview}`,
        metadata: { tool: message.tool_name },
      });

      return ok({ executed: false, result: 'Action annulée. Rien n’a été modifié.' });
    }

    // Permission is re-checked at execution time, not only when the tool was
    // offered: a role can change between the proposal and the confirmation.
    let result: string;
    try {
      result = executeTool(message.tool_name, input, user);
      aiRepo.setToolStatus(body.messageId, 'executed');
    } catch {
      aiRepo.setToolStatus(body.messageId, 'failed');
      return badRequest('L’action a échoué. Rien n’a été modifié.');
    }

    aiRepo.addMessage({ conversationId: message.conversation_id, role: 'assistant', content: result });

    log({
      action: 'ai.action',
      entityType: 'ai',
      entityId: message.conversation_id,
      entityLabel: message.tool_name,
      summary: `Action IA confirmée et exécutée : ${preview}`,
      metadata: { tool: message.tool_name, input, result },
    });

    return ok({ executed: true, result });
  },
);
