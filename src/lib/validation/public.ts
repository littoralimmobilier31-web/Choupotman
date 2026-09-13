import { z } from 'zod';
import { locales } from '@/lib/i18n/config';

/**
 * Validation schemas for public (unauthenticated) input.
 *
 * The server is the authority: the client-side checks in the forms exist for
 * feedback only. Every string is trimmed and length-capped here, which also
 * bounds what can be written to the database from the open internet.
 */

const trimmed = (max: number) => z.string().trim().max(max);

export const localeSchema = z.enum(locales).default('fr');

export const contactSchema = z.object({
  name: trimmed(120).min(2, 'Merci d’indiquer votre nom.'),
  email: trimmed(180).email('Adresse email invalide.'),
  phone: trimmed(40).optional().or(z.literal('')),
  company: trimmed(140).optional().or(z.literal('')),
  service: trimmed(160).optional().or(z.literal('')),
  budget: trimmed(80).optional().or(z.literal('')),
  deadline: trimmed(80).optional().or(z.literal('')),
  message: trimmed(4000).min(10, 'Décrivez votre besoin en quelques mots.'),
  locale: localeSchema,
  /** Honeypot — must stay empty. A filled value means a bot. */
  website: z.string().max(0, 'Requête refusée.').optional().or(z.literal('')),
});

export type ContactInput = z.infer<typeof contactSchema>;

export const projectRequestSchema = contactSchema.extend({
  message: trimmed(8000).min(10, 'Décrivez votre projet.'),
  payload: trimmed(20000).optional().or(z.literal('')),
});

export type ProjectRequestInput = z.infer<typeof projectRequestSchema>;

export const chatSchema = z.object({
  locale: localeSchema,
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: trimmed(2000).min(1),
      }),
    )
    .min(1, 'Message vide.')
    .max(24, 'Conversation trop longue.'),
});

export type ChatInput = z.infer<typeof chatSchema>;

export const briefAnswerSchema = z.object({
  questionKey: trimmed(80).min(1),
  value: z.string().trim().max(6000).optional().or(z.literal('')),
});

export const briefSubmitSchema = z.object({
  answers: z.array(briefAnswerSchema).max(80),
  complete: z.boolean().optional(),
});

export const clientFeedbackSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  comment: trimmed(4000).optional().or(z.literal('')),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  decision: z.enum(['approved', 'changes_requested', 'comment']).default('comment'),
});

export const loginSchema = z.object({
  login: trimmed(180).min(1, 'Identifiant requis.'),
  password: z.string().min(1, 'Mot de passe requis.').max(200),
  csrf: z.string().min(1),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Mot de passe actuel requis.').max(200),
    newPassword: z.string().min(10, 'Au moins 10 caractères.').max(200),
    confirmPassword: z.string().min(1).max(200),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Les deux mots de passe ne correspondent pas.',
    path: ['confirmPassword'],
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: 'Le nouveau mot de passe doit être différent de l’actuel.',
    path: ['newPassword'],
  });

export const passwordResetRequestSchema = z.object({
  email: trimmed(180).email('Adresse email invalide.'),
});

export const passwordResetSchema = z
  .object({
    token: trimmed(200).min(10),
    newPassword: z.string().min(10, 'Au moins 10 caractères.').max(200),
    confirmPassword: z.string().min(1).max(200),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Les deux mots de passe ne correspondent pas.',
    path: ['confirmPassword'],
  });

/**
 * Turns a Zod error into a `field → first message` map, which is what the forms
 * render next to each input.
 */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form';
    if (!result[key]) result[key] = issue.message;
  }
  return result;
}

/** Reads a FormData into a plain object, dropping File entries. */
export function formToObject(form: FormData): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string') result[key] = value;
  }
  return result;
}
