// Server-only by construction: this module imports Node built-ins / native
// bindings, which the bundler refuses in a client component. The `server-only`
// guard is deliberately NOT used here so the CLI scripts in scripts/ can
// import it directly (that package throws outside the Next bundler).
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

/**
 * PDF generation.
 *
 * Built on pdf-lib with the standard Helvetica family, which keeps the bundle
 * small and needs no font files. The trade-off is the WinAnsi character set:
 * French and English render perfectly, but Arabic glyphs are not representable.
 * `sanitize()` therefore replaces unsupported characters instead of letting
 * pdf-lib throw mid-document, and Arabic documents are better produced through
 * the printable HTML view (`/espace-admin/.../imprimer`), which the browser
 * renders with full Unicode and RTL support. See docs/PDF.md.
 */

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 48;

/** Palette kept close to the app's own, so a document looks like the product. */
const INK = rgb(0.12, 0.13, 0.18);
const MUTED = rgb(0.42, 0.43, 0.5);
const SUBTLE = rgb(0.62, 0.63, 0.69);
const LINE = rgb(0.88, 0.89, 0.92);
const ACCENT = rgb(0.447, 0.369, 0.878);
const SURFACE = rgb(0.976, 0.976, 0.98);

export type DocumentParty = {
  name: string;
  lines: string[];
};

export type DocumentLine = {
  label: string;
  description?: string | null;
  quantity: number;
  unit: string;
  unitPrice: string;
  discount?: number;
  total: string;
};

export type DocumentTotal = { label: string; value: string; strong?: boolean };

export type DocumentMeta = { label: string; value: string };

export type BuildDocumentInput = {
  /** "DEVIS" / "FACTURE" / "CONTRAT". */
  kind: string;
  number: string;
  /** Optional status chip, e.g. "PAYÉE" or "BROUILLON". */
  statusLabel?: string | null;
  title?: string | null;
  issuer: DocumentParty;
  recipient: DocumentParty;
  meta: DocumentMeta[];
  lines: DocumentLine[];
  totals: DocumentTotal[];
  /** Free-text blocks printed after the table (terms, conditions, notes). */
  blocks?: { heading: string; body: string }[];
  footer?: string | null;
  /** Watermark drawn diagonally across every page, e.g. "BROUILLON". */
  watermark?: string | null;
};

/**
 * Replaces characters the standard fonts cannot encode.
 *
 * Typographic punctuation is mapped to its ASCII equivalent (so a curly
 * apostrophe does not become a placeholder), and anything still outside WinAnsi
 * becomes "?" rather than crashing the whole document.
 */
export function sanitize(value: string | null | undefined): string {
  if (!value) return '';
  const mapped = value
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”‟]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    .replace(/[   ]/g, ' ')
    .replace(/€/g, 'EUR')
    .replace(/[•●]/g, '-');

  // WinAnsi covers Latin-1 plus a handful of extras; drop the rest.
  return [...mapped]
    .map((char) => {
      const code = char.codePointAt(0) ?? 0;
      if (code === 10 || code === 13 || code === 9) return char;
      if (code >= 32 && code <= 255) return char;
      return '?';
    })
    .join('');
}

type Ctx = {
  doc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  y: number;
  pageNumber: number;
  watermark: string | null;
};

function newPage(ctx: Ctx): void {
  ctx.page = ctx.doc.addPage([A4.width, A4.height]);
  ctx.pageNumber += 1;
  ctx.y = A4.height - MARGIN;
  if (ctx.watermark) drawWatermark(ctx);
}

/** Adds a page when the next block would not fit. */
function ensureSpace(ctx: Ctx, needed: number): void {
  if (ctx.y - needed < MARGIN + 40) newPage(ctx);
}

function drawWatermark(ctx: Ctx): void {
  const text = sanitize(ctx.watermark ?? '');
  if (!text) return;
  ctx.page.drawText(text, {
    x: 120,
    y: A4.height / 2 - 60,
    size: 64,
    font: ctx.bold,
    color: rgb(0.9, 0.9, 0.93),
    rotate: { type: 'degrees', angle: 32 } as never,
    opacity: 0.6,
  });
}

function text(
  ctx: Ctx,
  value: string,
  options: {
    x?: number;
    size?: number;
    bold?: boolean;
    color?: ReturnType<typeof rgb>;
    align?: 'left' | 'right';
    maxWidth?: number;
    lineHeight?: number;
  } = {},
): void {
  const size = options.size ?? 9.5;
  const font = options.bold ? ctx.bold : ctx.font;
  const color = options.color ?? INK;
  const lineHeight = options.lineHeight ?? size * 1.45;
  const clean = sanitize(value);
  if (clean === '') return;

  const maxWidth = options.maxWidth ?? A4.width - MARGIN * 2 - (options.x ? options.x - MARGIN : 0);
  const lines = wrap(clean, font, size, maxWidth);

  for (const line of lines) {
    ensureSpace(ctx, lineHeight);
    const width = font.widthOfTextAtSize(line, size);
    const x = options.align === 'right' ? (options.x ?? A4.width - MARGIN) - width : (options.x ?? MARGIN);
    ctx.page.drawText(line, { x, y: ctx.y - size, size, font, color });
    ctx.y -= lineHeight;
  }
}

/** Word wrap that also honours explicit newlines and breaks over-long words. */
function wrap(value: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of value.split('\n')) {
    if (paragraph.trim() === '') {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line === '' ? word : `${line} ${word}`;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line !== '') out.push(line);
      // A single word longer than the column: hard-break it.
      if (font.widthOfTextAtSize(word, size) > maxWidth) {
        let chunk = '';
        for (const char of word) {
          if (font.widthOfTextAtSize(chunk + char, size) > maxWidth) {
            out.push(chunk);
            chunk = char;
          } else {
            chunk += char;
          }
        }
        line = chunk;
      } else {
        line = word;
      }
    }
    if (line !== '') out.push(line);
  }
  return out;
}

function hr(ctx: Ctx, color = LINE): void {
  ensureSpace(ctx, 10);
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: A4.width - MARGIN, y: ctx.y },
    thickness: 0.75,
    color,
  });
  ctx.y -= 12;
}

/** Renders a quote / invoice / contract to PDF bytes. */
export async function buildDocument(input: BuildDocumentInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(sanitize(`${input.kind} ${input.number}`));
  doc.setAuthor(sanitize(input.issuer.name));
  doc.setCreator('CHOUPOTMAN OS');
  doc.setProducer('CHOUPOTMAN OS');
  doc.setCreationDate(new Date());

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const ctx: Ctx = {
    doc,
    page: doc.addPage([A4.width, A4.height]),
    font,
    bold,
    y: A4.height - MARGIN,
    pageNumber: 1,
    watermark: input.watermark ?? null,
  };
  if (ctx.watermark) drawWatermark(ctx);

  // ── Header band ────────────────────────────────────────────────────────
  ctx.page.drawRectangle({
    x: 0,
    y: A4.height - 96,
    width: A4.width,
    height: 96,
    color: SURFACE,
  });
  ctx.page.drawRectangle({ x: 0, y: A4.height - 96, width: 4, height: 96, color: ACCENT });

  ctx.page.drawText(sanitize(input.issuer.name), {
    x: MARGIN,
    y: A4.height - 44,
    size: 15,
    font: bold,
    color: INK,
  });
  let issuerY = A4.height - 60;
  for (const line of input.issuer.lines.slice(0, 3)) {
    ctx.page.drawText(sanitize(line), { x: MARGIN, y: issuerY, size: 8, font, color: MUTED });
    issuerY -= 11;
  }

  const kindText = sanitize(input.kind.toUpperCase());
  const kindWidth = bold.widthOfTextAtSize(kindText, 20);
  ctx.page.drawText(kindText, {
    x: A4.width - MARGIN - kindWidth,
    y: A4.height - 46,
    size: 20,
    font: bold,
    color: ACCENT,
  });
  const numberWidth = font.widthOfTextAtSize(sanitize(input.number), 11);
  ctx.page.drawText(sanitize(input.number), {
    x: A4.width - MARGIN - numberWidth,
    y: A4.height - 64,
    size: 11,
    font,
    color: INK,
  });
  if (input.statusLabel) {
    const status = sanitize(input.statusLabel.toUpperCase());
    const statusWidth = bold.widthOfTextAtSize(status, 7.5);
    ctx.page.drawText(status, {
      x: A4.width - MARGIN - statusWidth,
      y: A4.height - 80,
      size: 7.5,
      font: bold,
      color: MUTED,
    });
  }

  ctx.y = A4.height - 124;

  // ── Recipient + metadata ───────────────────────────────────────────────
  const columnY = ctx.y;
  text(ctx, 'DESTINATAIRE', { size: 7.5, bold: true, color: SUBTLE, maxWidth: 260 });
  text(ctx, input.recipient.name, { size: 11, bold: true, maxWidth: 260 });
  for (const line of input.recipient.lines) {
    text(ctx, line, { size: 8.5, color: MUTED, maxWidth: 260 });
  }
  const afterRecipient = ctx.y;

  // Metadata sits in the right column, so reset y and draw beside it.
  ctx.y = columnY;
  const metaX = A4.width / 2 + 30;
  text(ctx, 'INFORMATIONS', { x: metaX, size: 7.5, bold: true, color: SUBTLE, maxWidth: 200 });
  for (const item of input.meta) {
    ensureSpace(ctx, 13);
    ctx.page.drawText(sanitize(item.label), { x: metaX, y: ctx.y - 8.5, size: 8.5, font, color: MUTED });
    const valueWidth = bold.widthOfTextAtSize(sanitize(item.value), 8.5);
    ctx.page.drawText(sanitize(item.value), {
      x: A4.width - MARGIN - valueWidth,
      y: ctx.y - 8.5,
      size: 8.5,
      font: bold,
      color: INK,
    });
    ctx.y -= 14;
  }

  ctx.y = Math.min(afterRecipient, ctx.y) - 14;

  if (input.title) {
    hr(ctx);
    text(ctx, input.title, { size: 12, bold: true });
    ctx.y -= 4;
  }

  // ── Line-item table ────────────────────────────────────────────────────
  if (input.lines.length > 0) {
    hr(ctx);

    const columns = {
      label: MARGIN,
      qty: A4.width - MARGIN - 250,
      unit: A4.width - MARGIN - 195,
      price: A4.width - MARGIN - 105,
      total: A4.width - MARGIN,
    };

    const header = () => {
      ensureSpace(ctx, 22);
      ctx.page.drawText('DESIGNATION', { x: columns.label, y: ctx.y - 8, size: 7.5, font: bold, color: SUBTLE });
      ctx.page.drawText('QTE', { x: columns.qty, y: ctx.y - 8, size: 7.5, font: bold, color: SUBTLE });
      ctx.page.drawText('UNITE', { x: columns.unit, y: ctx.y - 8, size: 7.5, font: bold, color: SUBTLE });
      const pu = 'PRIX U.';
      ctx.page.drawText(pu, {
        x: columns.price - bold.widthOfTextAtSize(pu, 7.5) + 60,
        y: ctx.y - 8,
        size: 7.5,
        font: bold,
        color: SUBTLE,
      });
      const tot = 'TOTAL';
      ctx.page.drawText(tot, {
        x: columns.total - bold.widthOfTextAtSize(tot, 7.5),
        y: ctx.y - 8,
        size: 7.5,
        font: bold,
        color: SUBTLE,
      });
      ctx.y -= 16;
      ctx.page.drawLine({
        start: { x: MARGIN, y: ctx.y },
        end: { x: A4.width - MARGIN, y: ctx.y },
        thickness: 0.75,
        color: LINE,
      });
      ctx.y -= 8;
    };

    header();

    for (const [index, line] of input.lines.entries()) {
      const labelLines = wrap(sanitize(line.label), bold, 9, columns.qty - MARGIN - 12);
      const descLines = line.description
        ? wrap(sanitize(line.description), font, 8, columns.qty - MARGIN - 12)
        : [];
      const rowHeight = labelLines.length * 12 + descLines.length * 10.5 + 10;

      // Repeat the header when the row lands on a new page.
      if (ctx.y - rowHeight < MARGIN + 60) {
        newPage(ctx);
        header();
      }

      const rowTop = ctx.y;

      labelLines.forEach((part, i) => {
        ctx.page.drawText(part, { x: columns.label, y: rowTop - 9 - i * 12, size: 9, font: bold, color: INK });
      });
      descLines.forEach((part, i) => {
        ctx.page.drawText(part, {
          x: columns.label,
          y: rowTop - 9 - labelLines.length * 12 - i * 10.5,
          size: 8,
          font,
          color: MUTED,
        });
      });

      const qty = sanitize(
        line.discount && line.discount > 0
          ? `${line.quantity} (-${line.discount}%)`
          : String(line.quantity),
      );
      ctx.page.drawText(qty, { x: columns.qty, y: rowTop - 9, size: 9, font, color: INK });
      ctx.page.drawText(sanitize(line.unit), { x: columns.unit, y: rowTop - 9, size: 9, font, color: MUTED });

      const priceText = sanitize(line.unitPrice);
      ctx.page.drawText(priceText, {
        x: columns.price - font.widthOfTextAtSize(priceText, 9) + 60,
        y: rowTop - 9,
        size: 9,
        font,
        color: INK,
      });

      const totalText = sanitize(line.total);
      ctx.page.drawText(totalText, {
        x: columns.total - bold.widthOfTextAtSize(totalText, 9),
        y: rowTop - 9,
        size: 9,
        font: bold,
        color: INK,
      });

      ctx.y = rowTop - rowHeight;

      if (index < input.lines.length - 1) {
        ctx.page.drawLine({
          start: { x: MARGIN, y: ctx.y + 4 },
          end: { x: A4.width - MARGIN, y: ctx.y + 4 },
          thickness: 0.4,
          color: LINE,
        });
      }
    }

    ctx.y -= 4;
  }

  // ── Totals block, right-aligned ────────────────────────────────────────
  if (input.totals.length > 0) {
    ensureSpace(ctx, input.totals.length * 18 + 20);
    const boxTop = ctx.y;
    const boxX = A4.width / 2 + 40;

    ctx.page.drawLine({
      start: { x: boxX, y: boxTop },
      end: { x: A4.width - MARGIN, y: boxTop },
      thickness: 0.75,
      color: LINE,
    });
    ctx.y -= 10;

    for (const total of input.totals) {
      ensureSpace(ctx, 18);
      const size = total.strong ? 11 : 9;
      const labelFont = total.strong ? bold : font;
      ctx.page.drawText(sanitize(total.label), {
        x: boxX,
        y: ctx.y - size,
        size,
        font: labelFont,
        color: total.strong ? INK : MUTED,
      });
      const valueText = sanitize(total.value);
      ctx.page.drawText(valueText, {
        x: A4.width - MARGIN - bold.widthOfTextAtSize(valueText, size),
        y: ctx.y - size,
        size,
        font: bold,
        color: total.strong ? ACCENT : INK,
      });
      ctx.y -= size * 1.75;
    }
    ctx.y -= 8;
  }

  // ── Free-text blocks ───────────────────────────────────────────────────
  for (const block of input.blocks ?? []) {
    if (!block.body || block.body.trim() === '') continue;
    ensureSpace(ctx, 40);
    hr(ctx);
    text(ctx, block.heading.toUpperCase(), { size: 7.5, bold: true, color: SUBTLE });
    ctx.y -= 2;
    text(ctx, block.body, { size: 8.5, color: MUTED, lineHeight: 12.5 });
    ctx.y -= 4;
  }

  // ── Footer on every page ───────────────────────────────────────────────
  const pages = doc.getPages();
  pages.forEach((page, index) => {
    page.drawLine({
      start: { x: MARGIN, y: MARGIN - 14 },
      end: { x: A4.width - MARGIN, y: MARGIN - 14 },
      thickness: 0.5,
      color: LINE,
    });
    if (input.footer) {
      page.drawText(sanitize(input.footer), { x: MARGIN, y: MARGIN - 26, size: 7, font, color: SUBTLE });
    }
    const pageLabel = `Page ${index + 1} / ${pages.length}`;
    page.drawText(pageLabel, {
      x: A4.width - MARGIN - font.widthOfTextAtSize(pageLabel, 7),
      y: MARGIN - 26,
      size: 7,
      font,
      color: SUBTLE,
    });
  });

  return doc.save();
}

/** Wraps PDF bytes in a download or inline response. */
export function pdfResponse(bytes: Uint8Array, filename: string, download = true): Response {
  const safeName = filename.replace(/[^A-Za-z0-9._-]/g, '-');
  // Copy into a fresh ArrayBuffer so the Response body is a plain BlobPart.
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${safeName}"`,
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
