// Server-only by construction: this module imports Node built-ins / native
// bindings, which the bundler refuses in a client component. The `server-only`
// guard is deliberately NOT used here so the CLI scripts in scripts/ can
// import it directly (that package throws outside the Next bundler).
import { createConnection, type Socket } from 'node:net';
import { connect as tlsConnect, type TLSSocket } from 'node:tls';
import { config } from '@/lib/config';
import { escapeHtml, wrapEmailHtml } from './templates';
import * as commsRepo from '@/lib/db/repositories/comms';

/**
 * Email delivery.
 *
 * Two modes, chosen by whether SMTP is configured:
 *
 *   • configured  → the message is sent over SMTP and the row is marked `sent`;
 *   • not configured → the message stays in `messages` with status `queued` and
 *     is visible in the admin outbox. Nothing is ever silently dropped, and the
 *     app is fully usable before SMTP exists.
 *
 * The SMTP client is a minimal, dependency-free implementation covering exactly
 * what is needed: STARTTLS or implicit TLS, AUTH LOGIN/PLAIN, one recipient,
 * MIME multipart/alternative. Anything more exotic belongs to a real provider
 * SDK — see docs/EMAIL.md for swapping the transport.
 */

export type SendResult =
  | { ok: true; mode: 'smtp' | 'queued'; messageId: number }
  | { ok: false; mode: 'smtp' | 'queued'; messageId: number; error: string };

export type SendInput = {
  to: string;
  toName?: string | null;
  subject: string;
  /** Plain-text body; the HTML version is generated from it. */
  text: string;
  templateKey?: string | null;
  clientId?: number | null;
  projectId?: number | null;
  leadId?: number | null;
  invoiceId?: number | null;
  createdBy?: number | null;
  /** Persist as a draft instead of attempting delivery. */
  asDraft?: boolean;
};

/** Basic address check — a malformed address must never reach the SMTP dialogue. */
function isValidAddress(value: string): boolean {
  return /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/.test(value.trim());
}

/** Strips CR/LF, which is how SMTP header injection happens. */
function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim().slice(0, 500);
}

export async function sendEmail(input: SendInput): Promise<SendResult> {
  const to = input.to.trim();
  const subject = sanitizeHeader(input.subject);

  const messageId = commsRepo.createMessage({
    channel: 'email',
    templateKey: input.templateKey ?? null,
    clientId: input.clientId ?? null,
    projectId: input.projectId ?? null,
    leadId: input.leadId ?? null,
    invoiceId: input.invoiceId ?? null,
    toName: input.toName ?? null,
    toAddress: to,
    fromAddress: config.mail.from,
    subject,
    body: input.text,
    status: input.asDraft ? 'draft' : config.mail.enabled ? 'queued' : 'queued',
    createdBy: input.createdBy ?? null,
  });

  if (input.asDraft) return { ok: true, mode: 'queued', messageId };

  if (!isValidAddress(to)) {
    commsRepo.markMessageFailed(messageId, 'Adresse destinataire invalide.');
    return { ok: false, mode: 'queued', messageId, error: 'Adresse destinataire invalide.' };
  }

  // No SMTP configured: the message stays queued and visible in the admin.
  if (!config.mail.enabled) {
    return { ok: true, mode: 'queued', messageId };
  }

  try {
    await smtpSend({
      to,
      subject,
      text: input.text,
      html: wrapEmailHtml({
        title: subject,
        body: input.text,
        footer: config.site.owner,
        siteUrl: config.site.url,
      }),
    });
    commsRepo.markMessageSent(messageId);
    return { ok: true, mode: 'smtp', messageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    commsRepo.markMessageFailed(messageId, message);
    return { ok: false, mode: 'smtp', messageId, error: message };
  }
}

/** Retries everything sitting in the outbox. Used by the admin's "send queue". */
export async function flushQueue(limit = 25): Promise<{ sent: number; failed: number; skipped: number }> {
  if (!config.mail.enabled) {
    return { sent: 0, failed: 0, skipped: commsRepo.listQueuedMessages(limit).length };
  }

  let sent = 0;
  let failed = 0;

  for (const message of commsRepo.listQueuedMessages(limit)) {
    if (!message.to_address || !isValidAddress(message.to_address)) {
      commsRepo.markMessageFailed(message.id, 'Adresse destinataire invalide.');
      failed += 1;
      continue;
    }
    try {
      await smtpSend({
        to: message.to_address,
        subject: sanitizeHeader(message.subject ?? '(sans objet)'),
        text: message.body ?? '',
        html: wrapEmailHtml({
          title: message.subject ?? '',
          body: message.body ?? '',
          footer: config.site.owner,
          siteUrl: config.site.url,
        }),
      });
      commsRepo.markMessageSent(message.id);
      sent += 1;
    } catch (error) {
      commsRepo.markMessageFailed(message.id, error instanceof Error ? error.message : String(error));
      failed += 1;
    }
  }

  return { sent, failed, skipped: 0 };
}

// ── Minimal SMTP client ──────────────────────────────────────────────────

type SmtpMessage = { to: string; subject: string; text: string; html: string };

function encodeHeader(value: string): string {
  // RFC 2047 for non-ASCII subjects, so accents survive every client.

  if (!/[^\x00-\x7F]/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function buildMime(message: SmtpMessage): string {
  const boundary = `chp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const lines = [
    `From: ${config.mail.from}`,
    `To: ${message.to}`,
    `Subject: ${encodeHeader(message.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(message.text, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n'),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(message.html, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n'),
    '',
    `--${boundary}--`,
    '',
  ];
  return lines.join('\r\n');
}

/**
 * Speaks just enough SMTP to deliver one message. Every reply code is checked;
 * an unexpected code aborts rather than continuing blindly.
 */
function smtpSend(message: SmtpMessage): Promise<void> {
  return new Promise((resolve, reject) => {
    const implicitTls = config.mail.port === 465;
    let socket: Socket | TLSSocket;
    let settled = false;
    let buffer = '';
    let upgraded = false;

    const steps: { expect: number[]; command?: string | (() => string) }[] = [];
    let index = -1;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      try { socket.end(); } catch { /* already closed */ }
      if (error) reject(error);
      else resolve();
    };

    const timeout = setTimeout(() => finish(new Error('Délai SMTP dépassé.')), 20_000);

    const write = (line: string) => {
      socket.write(`${line}\r\n`);
    };

    const advance = () => {
      index += 1;
      const step = steps[index];
      if (!step) {
        clearTimeout(timeout);
        finish();
        return;
      }
      if (step.command !== undefined) {
        write(typeof step.command === 'function' ? step.command() : step.command);
      }
    };

    const onLine = (line: string) => {
      // Multi-line replies use "250-" for continuations; wait for "250 ".
      if (/^\d{3}-/.test(line)) return;
      const code = Number.parseInt(line.slice(0, 3), 10);
      const step = steps[index];

      if (index === -1) {
        // Server greeting.
        if (code !== 220) {
          clearTimeout(timeout);
          finish(new Error(`SMTP: accueil inattendu (${line})`));
          return;
        }
        advance();
        return;
      }

      if (!step) return;

      if (!step.expect.includes(code)) {
        clearTimeout(timeout);
        finish(new Error(`SMTP: réponse ${code} inattendue (${line.trim()})`));
        return;
      }

      // STARTTLS accepted: upgrade the socket, then continue the dialogue.
      if (!implicitTls && !upgraded && step.command === 'STARTTLS') {
        upgraded = true;
        const plain = socket as Socket;
        plain.removeAllListeners('data');
        const secure = tlsConnect({ socket: plain, servername: config.mail.host });
        secure.on('error', (err) => { clearTimeout(timeout); finish(err); });
        secure.on('data', onData);
        socket = secure;
        secure.once('secureConnect', () => advance());
        return;
      }

      advance();
    };

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      let newline = buffer.indexOf('\r\n');
      while (newline !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 2);
        onLine(line);
        newline = buffer.indexOf('\r\n');
      }
    };

    // Build the dialogue up front so the flow is readable.
    steps.push({ expect: [250], command: `EHLO ${config.site.domain}` });
    if (!implicitTls) {
      steps.push({ expect: [220], command: 'STARTTLS' });
      steps.push({ expect: [250], command: `EHLO ${config.site.domain}` });
    }
    if (config.mail.user) {
      steps.push({ expect: [334], command: 'AUTH LOGIN' });
      steps.push({ expect: [334], command: () => Buffer.from(config.mail.user, 'utf8').toString('base64') });
      steps.push({ expect: [235], command: () => Buffer.from(config.mail.password, 'utf8').toString('base64') });
    }
    // Envelope sender: the address inside SMTP_FROM, without the display name.
    const envelopeFrom = (config.mail.from.match(/<([^>]+)>/)?.[1] ?? config.mail.from).trim();
    steps.push({ expect: [250], command: `MAIL FROM:<${envelopeFrom}>` });
    steps.push({ expect: [250, 251], command: `RCPT TO:<${message.to}>` });
    steps.push({ expect: [354, 250], command: 'DATA' });
    steps.push({
      expect: [250],
      command: () => {
        // Dot-stuffing: a lone "." would terminate the data section early.
        const body = buildMime(message).replace(/\r\n\./g, '\r\n..');
        return `${body}\r\n.`;
      },
    });
    steps.push({ expect: [221, 250], command: 'QUIT' });

    socket = implicitTls
      ? tlsConnect({ host: config.mail.host, port: config.mail.port, servername: config.mail.host })
      : createConnection({ host: config.mail.host, port: config.mail.port });

    socket.on('error', (error) => { clearTimeout(timeout); finish(error); });
    socket.on('data', onData);
    socket.on('close', () => {
      clearTimeout(timeout);
      // Closing after QUIT is the normal ending.
      if (!settled && index >= steps.length - 1) finish();
      else if (!settled) finish(new Error('SMTP: connexion fermée prématurément.'));
    });
  });
}

export { escapeHtml };
