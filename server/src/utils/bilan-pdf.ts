import PDFDocument from 'pdfkit';

/**
 * V8-D7 / §14.G clos — PDF du bilan mensuel (génération serveur, hors-ligne).
 *
 * Garanties :
 *  - A4, marges 48 pt, bandeau de marque, aucun lien externe, aucune image ;
 *  - AUCUNE donnée d'un tiers (acheteur), AUCUNE coordonnée vendeur
 *    (phone/email/adresse de collecte/référence de paiement) ;
 *  - typographie WinAnsi (polices standard PDF) : translittération défensive
 *    des glyphes hors Latin-1 (jamais de crash sur emoji/CJK dans un nom) ;
 *  - sortie : Buffer en mémoire (jamais écrit sur disque) ;
 *  - magic bytes `%PDF-` natifs ; taille typique 15–40 Ko.
 */

export interface BilanPdfInput {
  boutique: string;
  period: string;         // libellé lisible, ex. « novembre 2026 »
  periodIso: string;      // 'YYYY-MM'
  generatedAt?: Date;
  views: number;
  viewsLabel: string;     // 'vues du mois' | 'vues cumulées (1er relevé)'
  salesCount: number;
  revenueFcfa: number;
  netRevenueFcfa: number;
  commissionFcfa: number;
  avgBasketFcfa: number | null;
  bestProductName: string | null;
  bestProductSales: number | null;
  conversionRate: number | null;
}

const money = new Intl.NumberFormat('fr-FR');
function fcfa(n: number): string {
  return `${money.format(n)} FCFA`;
}
function pct(rate: number | null): string {
  return rate == null ? '—' : `${(rate * 100).toFixed(2).replace('.', ',')} %`;
}
function dash(value: string | number | null | undefined): string {
  return value === null || value === undefined ? '—' : String(value);
}

/** Translittération défensive vers WinAnsi (ASCII + Latin-1 + ponctuation French courante). */
export function toWinAnsi(value: string): string {
  let out = '';
  for (const ch of value) {
    const code = ch.codePointAt(0)!;
    if (code <= 0x7e || (code >= 0xa0 && code <= 0xff)) { out += ch; continue; } // ASCII + Latin-1
    if (code === 0x20ac) { out += '€'; continue; }         // € — présent en WinAnsi (0x80)
    if (code === 0x2018 || code === 0x2019) { out += "'"; continue; }
    if (code === 0x201c || code === 0x201d) { out += '"'; continue; }
    if (code === 0x2013 || code === 0x2014) { out += '-'; continue; }
    if (code === 0x2026) { out += '...'; continue; }
    if (code === 0x2192) { out += '->'; continue; }        // flèche →
    if (/\p{Mark}/u.test(ch)) continue;                     // diacritique orphelin
    // Hors Latin-1 : décomposer puis translittérer chaque composant.
    for (const d of ch.normalize('NFKD')) {
      const dc = d.codePointAt(0)!;
      if (dc <= 0x7e || (dc >= 0xa0 && dc <= 0xff)) { out += d; continue; }
      if (/\p{Mark}/u.test(d)) continue;
      out += '?';
    }
  }
  return out;
}

function sectionTitle(doc: PDFKit.PDFDocument, text: string): void {
  doc.x = 48;
  doc.moveDown(0.9);
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#A9471F').text(toWinAnsi(text.toUpperCase()), 48, doc.y, { characterSpacing: 1.2 });
  doc.moveDown(0.25);
  doc.moveTo(48, doc.y).lineTo(547, doc.y).lineWidth(0.7).strokeColor('#E6DED0').stroke();
  doc.moveDown(0.35);
  doc.x = 48;
}

function row(doc: PDFKit.PDFDocument, label: string, value: string, emphasize = false): void {
  const y = doc.y;
  doc.x = 48;
  doc.font('Helvetica').fontSize(10.5).fillColor('#5B4A3E').text(toWinAnsi(label), 48, y, { width: 330 });
  doc.font(emphasize ? 'Helvetica-Bold' : 'Helvetica').fontSize(emphasize ? 11 : 10.5).fillColor('#171513')
    .text(toWinAnsi(value), 330, y, { width: 217, align: 'right' });
  doc.y = Math.max(doc.y, y + 14);
  doc.x = 48;
  doc.moveDown(0.28);
  doc.x = 48;
}

export async function renderBilanPdf(input: BilanPdfInput): Promise<Buffer> {
  const generatedAt = input.generatedAt ?? new Date();
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 48, bottom: 48, left: 48, right: 48 }, info: { Title: `Bilan ${input.periodIso} — ${toWinAnsi(input.boutique)}`, Author: 'ReVends', Creator: 'ReVends' } });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // ---------- Bandeau ----------
    doc.save();
    doc.rect(0, 0, 595.28, 118).fill('#171513');
    doc.rect(0, 112, 595.28, 6).fill('#B84D20');
    doc.fillColor('#DCC8A8').font('Helvetica-Bold').fontSize(9)
      .text('REVENDS — HÉBERGEMENT BOUTIQUE', 48, 26, { characterSpacing: 2.4 });
    doc.fillColor('#F7F3EC').font('Helvetica-Bold').fontSize(25).text('Bilan mensuel', 48, 44);
    doc.restore();

    // ---------- Boutique + période ----------
    doc.y = 132;
    doc.x = 48;
    doc.font('Helvetica-Bold').fontSize(17).fillColor('#171513').text(toWinAnsi(input.boutique), 48, doc.y, { width: 499 });
    doc.x = 48;
    doc.font('Helvetica').fontSize(11).fillColor('#7B6D5D').text(`Période : ${toWinAnsi(input.period)}`, 48, doc.y, { width: 499 });

    // ---------- Chiffres clés ----------
    sectionTitle(doc, 'Chiffres clés');
    row(doc, input.viewsLabel === 'vues cumulées (1er relevé)' ? 'Vues cumulées (1er relevé)' : 'Vues du mois', money.format(input.views));
    row(doc, 'Ventes', money.format(input.salesCount));
    row(doc, 'CA brut', fcfa(input.revenueFcfa), true);
    row(doc, 'Commission ReVends (10 %)', fcfa(input.commissionFcfa));
    row(doc, 'CA net (vendeur)', fcfa(input.netRevenueFcfa), true);
    row(doc, 'Panier moyen', input.avgBasketFcfa == null ? '—' : fcfa(input.avgBasketFcfa));
    row(doc, 'Taux de conversion (vues -> ventes)', pct(input.conversionRate));

    // ---------- Meilleurs articles ----------
    sectionTitle(doc, 'Meilleurs articles');
    if (input.bestProductName) {
      row(doc, 'Meilleur article du mois', `${toWinAnsi(input.bestProductName)} — ${money.format(input.bestProductSales ?? 0)} vente(s)`);
    } else {
      row(doc, 'Meilleur article du mois', 'Aucune vente sur la période');
    }
    sectionTitle(doc, 'Points clés');
    const highlights: string[] = [];
    highlights.push(input.salesCount > 0 ? `${money.format(input.salesCount)} vente(s) conclues sur la période.` : 'Aucune vente enregistrée sur la période.');
    if (input.conversionRate != null && input.conversionRate > 0) {
      highlights.push(`Un article sur ${Math.max(1, Math.round(1 / input.conversionRate))} vues aboutit à une vente (${pct(input.conversionRate)}).`);
    } else if (input.views > 0) {
      highlights.push('Vos articles sont vus mais ne se vendent pas encore : revisitez photos, prix et descriptions.');
    }
    if (input.netRevenueFcfa > 0) {
      highlights.push(`CA net vendeur : ${fcfa(input.netRevenueFcfa)} après commission ReVends de 10 %.`);
    }
    for (const line of highlights) {
      doc.x = 48;
      doc.font('Helvetica').fontSize(10).fillColor('#3A2923').list([toWinAnsi(line)], 48, doc.y, { bulletRadius: 2, textIndent: 10, width: 499 });
      doc.moveDown(0.15);
      doc.x = 48;
    }

    // ---------- Pied de page (flux normal : aucun saut de page parasite) ----------
    doc.moveDown(1.2);
    const fy = doc.y;
    doc.moveTo(48, fy).lineTo(547, fy).lineWidth(0.7).strokeColor('#E6DED0').stroke();
    doc.moveDown(0.4);
    doc.font('Helvetica').fontSize(8.5).fillColor('#8C7A6B')
      .text(`ReVends — Hébergement Boutique · Bilan généré le ${generatedAt.toISOString().slice(0, 10)} (UTC)`, { width: 499, align: 'center' });

    doc.end();
  });
}
