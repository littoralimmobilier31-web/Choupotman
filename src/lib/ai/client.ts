import Anthropic from '@anthropic-ai/sdk';
import { config } from '@/lib/config';

/**
 * Thin wrapper around the Anthropic SDK.
 *
 * The whole AI layer is optional by design: when no API key is configured every
 * feature falls back to a deterministic, database-grounded implementation rather
 * than failing or — worse — inventing content. `available()` is the single check
 * the rest of the code uses, so there is one place that decides.
 *
 * The key is read from the environment through `config`, never hard-coded and
 * never sent to the browser.
 */

let cached: Anthropic | null = null;

export function available(): boolean {
  return config.ai.enabled;
}

function client(): Anthropic {
  if (!cached) cached = new Anthropic({ apiKey: config.ai.apiKey });
  return cached;
}

export type CompletionResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
};

export type CompletionOptions = {
  system: string;
  messages: Anthropic.MessageParam[];
  maxTokens?: number;
  /** Depth of reasoning; `low` for short rewrites, `high` for analysis. */
  effort?: 'low' | 'medium' | 'high';
  tools?: Anthropic.Tool[];
};

export type ToolProposal = {
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type ToolCompletionResult = CompletionResult & {
  /** Tool calls Claude wants to make; the caller decides whether to run them. */
  proposals: ToolProposal[];
  stopReason: string | null;
};

/** One non-streaming request. Throws `AiError` on any failure. */
export async function complete(options: CompletionOptions): Promise<CompletionResult> {
  const result = await completeWithTools(options);
  return result;
}

/**
 * Request that may come back with tool calls.
 *
 * Deliberately does **not** execute them: the admin assistant must show the user
 * what it intends to do and get confirmation before anything is written. The
 * caller gets the proposals and decides.
 */
export async function completeWithTools(options: CompletionOptions): Promise<ToolCompletionResult> {
  if (!available()) throw new AiError('unavailable', 'Aucune clé API n’est configurée.');

  try {
    const response = await client().messages.create({
      model: config.ai.model,
      max_tokens: options.maxTokens ?? config.ai.maxTokens,
      system: options.system,
      messages: options.messages,
      // Adaptive thinking: Claude decides how much reasoning each request needs.
      thinking: { type: 'adaptive' },
      output_config: { effort: options.effort ?? 'medium' },
      ...(options.tools && options.tools.length > 0 ? { tools: options.tools } : {}),
    });

    let text = '';
    const proposals: ToolProposal[] = [];

    // `content` is a discriminated union: narrow before reading.
    for (const block of response.content) {
      if (block.type === 'text') text += block.text;
      else if (block.type === 'tool_use') {
        proposals.push({
          id: block.id,
          name: block.name,
          input: (block.input ?? {}) as Record<string, unknown>,
        });
      }
    }

    // A safety decline is a normal outcome, not an exception to swallow.
    if (response.stop_reason === 'refusal') {
      throw new AiError('refused', 'La demande a été refusée par le modèle.');
    }

    return {
      text: text.trim(),
      proposals,
      stopReason: response.stop_reason,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      model: response.model,
    };
  } catch (error) {
    if (error instanceof AiError) throw error;
    throw toAiError(error);
  }
}

export type AiErrorKind = 'unavailable' | 'rate_limited' | 'auth' | 'refused' | 'invalid' | 'network';

/** Carries a French, user-facing message; internals never reach the browser. */
export class AiError extends Error {
  readonly kind: AiErrorKind;

  constructor(kind: AiErrorKind, message: string) {
    super(message);
    this.name = 'AiError';
    this.kind = kind;
  }
}

function toAiError(error: unknown): AiError {
  if (error instanceof Anthropic.AuthenticationError) {
    return new AiError('auth', 'La clé API configurée est invalide.');
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new AiError('rate_limited', 'Trop de requêtes vers l’IA. Réessayez dans un instant.');
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new AiError('invalid', 'Requête refusée par l’API.');
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new AiError('network', 'Impossible de joindre l’API. Vérifiez la connexion.');
  }
  if (error instanceof Anthropic.APIError) {
    return new AiError('network', `Erreur de l’API (${error.status ?? '?'}).`);
  }
  return new AiError('network', 'Erreur inattendue lors de l’appel à l’IA.');
}

/** Extracts the first JSON object from a reply, tolerating fences and prose. */
export function parseJsonReply<T>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
