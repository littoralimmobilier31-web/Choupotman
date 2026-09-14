import { createHash } from 'node:crypto';
import { chatSchema } from '@/lib/validation/public';
import { fieldErrors } from '@/lib/validation/public';
import { isSameOrigin } from '@/lib/auth/csrf';
import { clientIp, rateLimit, tooManyRequests } from '@/lib/auth/rate-limit';
import { buildPublicKnowledge, publicSystemPrompt } from '@/lib/ai/knowledge';
import { answerFromRules } from '@/lib/ai/rules';
import { available, complete, AiError } from '@/lib/ai/client';
import * as aiRepo from '@/lib/db/repositories/ai';
import * as leadsRepo from '@/lib/db/repositories/leads';
import { notify } from '@/lib/db/repositories/comms';
import { getSetting } from '@/lib/db/repositories/settings';
import { defaultCurrency } from '@/lib/db/repositories/finance';
import { emit } from '@/lib/automation/engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public assistant.
 *
 * Unauthenticated by design — it is a website widget — so the protections are an
 * Origin check, a per-visitor rate limit, and a hard cap on what it can do: it
 * only ever reads a knowledge base assembled from the owner's own published
 * content, and it writes nothing except the conversation itself and, when the
 * visitor volunteers contact details, a lead.
 *
 * The "never invent anything about Boubaker" rule from the specification is
 * enforced in two places at once: the knowledge base contains only what the
 * owner entered (`lib/ai/knowledge.ts`), and without an API key the reply comes
 * from a keyword router that can only quote that same base (`lib/ai/rules.ts`).
 */

/**
 * Stable per-visitor key without a cookie or any personal data: a salted hash of
 * IP + user agent. It groups a visitor's messages into one conversation and
 * feeds the rate limiter; it cannot be reversed into an identity.
 */
function visitorKey(request: Request, ip: string): string {
  const agent = request.headers.get('user-agent') ?? '';
  return createHash('sha256').update(`chat:${ip}:${agent}`).digest('base64url').slice(0, 32);
}

/** Contact details the visitor typed themselves — never inferred. */
function extractContact(text: string): { email: string | null; phone: string | null } {
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.-]{2,}/)?.[0] ?? null;
  const phone = text.match(/(?:\+\d{1,3}[\s.-]?)?(?:0\d)(?:[\s.-]?\d{2}){4}/)?.[0] ?? null;
  return { email, phone };
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) {
    return Response.json({ error: 'Requête refusée.' }, { status: 403 });
  }

  // The owner can switch the widget off entirely from the settings.
  if (getSetting('features.chatbot', '1') !== '1') {
    return Response.json({ error: 'L’assistant est désactivé.' }, { status: 404 });
  }

  const ip = clientIp(request);
  const key = visitorKey(request, ip);

  const limit = rateLimit('chatbot', key);
  if (!limit.allowed) return tooManyRequests(limit);

  const parsed = chatSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: 'Message invalide.', fields: fieldErrors(parsed.error) }, { status: 400 });
  }

  const { locale, messages } = parsed.data;
  const lastUser = [...messages].reverse().find((message) => message.role === 'user');
  if (!lastUser) return Response.json({ error: 'Message vide.' }, { status: 400 });

  const knowledge = buildPublicKnowledge(locale);
  const conversationId = aiRepo.getOrCreateVisitorConversation(key, locale);
  aiRepo.addMessage({ conversationId, role: 'user', content: lastUser.content });

  let answer: string;
  let suggestions: string[] = [];
  let source: 'ai' | 'rules' = 'rules';

  if (available()) {
    try {
      const response = await complete({
        effort: 'low',
        maxTokens: 800,
        system: publicSystemPrompt(knowledge, locale),
        messages: messages.map((message) => ({ role: message.role, content: message.content })),
      });
      answer = response.text;
      source = 'ai';
      aiRepo.recordUsage(conversationId, response.inputTokens, response.outputTokens, response.model);
    } catch (error) {
      // A model outage must not break the widget: fall back to the rule router,
      // which answers from exactly the same knowledge base.
      if (!(error instanceof AiError)) throw error;
      const fallback = answerFromRules(lastUser.content, knowledge);
      answer = fallback.answer;
      suggestions = fallback.suggestions;
    }
  } else {
    const fallback = answerFromRules(lastUser.content, knowledge);
    answer = fallback.answer;
    suggestions = fallback.suggestions;
  }

  aiRepo.addMessage({ conversationId, role: 'assistant', content: answer });

  // ── Lead capture ───────────────────────────────────────────────────────
  // Only from details the visitor actually typed, and only once per conversation.
  const conversation = aiRepo.findConversation(conversationId);
  let captured = false;

  if (conversation && conversation.lead_id === null) {
    const transcript = messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n');
    const { email, phone } = extractContact(transcript);

    if (email || phone) {
      const leadId = leadsRepo.createLead({
        name: email ? email.split('@')[0] : 'Visiteur du site',
        email,
        phone,
        source: 'chatbot',
        message: transcript.slice(0, 3000),
        currency: defaultCurrency(),
      });
      aiRepo.attachLead(conversationId, leadId);
      captured = true;

      notify({
        kind: 'form',
        title: 'Nouveau contact via l’assistant du site',
        body: [email, phone].filter(Boolean).join(' · '),
        url: '/espace-admin/prospects?vue=liste',
        entityType: 'lead',
        entityId: leadId,
        severity: 'info',
        dedupeKey: `chatbot-lead-${leadId}`,
      });

      emit('lead.created', { leadId });
    }
  }

  // Field names match what the widget already consumes.
  return Response.json(
    { ok: true, reply: answer, suggestions, source, leadCaptured: captured },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
