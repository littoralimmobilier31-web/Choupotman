import { createHandler, ok, badRequest } from '@/lib/api/handler';
import { aiGenerateSchema } from '@/lib/validation/admin';
import { generate, GenerationError } from '@/lib/ai/generate';
import { AiError, available } from '@/lib/ai/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * One-shot AI generations triggered from admin buttons.
 *
 * Rate-limited under the `aiAdmin` policy because these calls cost money — a
 * stuck loop in the interface should not run up a bill. Every result carries the
 * source (`ai` or `rules`) so the screen can say which produced it.
 */
export const POST = createHandler(
  { permission: 'ai.create', schema: aiGenerateSchema, rateLimitPolicy: 'aiAdmin' },
  async ({ body, log }) => {
    try {
      const result = await generate({
        task: body.task,
        projectId: body.projectId ?? null,
        portfolioId: body.portfolioId ?? null,
        briefId: body.briefId ?? null,
        invoiceId: body.invoiceId ?? null,
        extra: body.extra ?? null,
      });

      const source = result.kind === 'analysis' ? result.analysis.source : result.source;

      log({
        action: 'ai.action',
        entityType: 'ai',
        summary: `Génération IA « ${body.task} » (${source === 'ai' ? 'modèle' : 'règles internes'})`,
        metadata: {
          task: body.task,
          source,
          projectId: body.projectId ?? null,
          portfolioId: body.portfolioId ?? null,
        },
      });

      return ok({ ...result, aiConfigured: available() });
    } catch (error) {
      // A missing key or a refused request is a normal outcome to explain, not a
      // 500 — the message is written for the person pressing the button.
      if (error instanceof GenerationError || error instanceof AiError) {
        return badRequest(error.message);
      }
      throw error;
    }
  },
);
