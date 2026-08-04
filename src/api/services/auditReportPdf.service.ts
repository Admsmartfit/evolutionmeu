import PDFDocument from 'pdfkit';

import { AuditAiExecutiveSummary, AuditAiOccurrence } from './baseAuditAiProvider.service';

export type AuditReportPdfInput = {
  id: string;
  executionDate: Date;
  periodStart: Date;
  periodEnd: Date;
  instancesAudited: string[] | null;
  overallRiskLevel: string | null;
  riskMatrix: Record<string, number> | null;
  executiveSummary: AuditAiExecutiveSummary | null;
  occurrencesDetails: AuditAiOccurrence[] | null;
  companyName?: string;
};

const RISK_ORDER = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const RISK_COLORS: Record<string, string> = {
  LOW: '#1f9d55',
  MEDIUM: '#d4a017',
  HIGH: '#e8590c',
  CRITICAL: '#c0392b',
};
const RISK_LABELS_PT: Record<string, string> = {
  LOW: 'Baixo Risco',
  MEDIUM: 'Médio Risco',
  HIGH: 'Alto Risco',
  CRITICAL: 'Crítico',
};

function formatDate(date: Date): string {
  return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function riskColor(level?: string | null): string {
  return RISK_COLORS[level || ''] || '#666666';
}

function riskLabel(level?: string | null): string {
  return RISK_LABELS_PT[level || ''] || level || 'N/A';
}

/**
 * Renders the executive audit/compliance report (RF08.2) as a PDF, following the
 * layout in the PRD (header, period/instances bar, executive summary, risk matrix,
 * occurrence details, confidentiality footer). Emoji markers from the PRD mockup
 * were replaced with color-coded text labels — PDFKit's built-in Helvetica fonts
 * don't carry color-emoji glyphs, so an emoji would render as a blank box.
 */
export class AuditReportPdfService {
  public generate(report: AuditReportPdfInput): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      try {
        this.renderHeader(doc, report);
        this.renderPeriodBar(doc, report);
        this.renderExecutiveSummary(doc, report);
        this.renderRiskMatrix(doc, report);
        this.renderOccurrences(doc, report);
        this.renderFooterOnAllPages(doc);
        doc.end();
      } catch (error) {
        reject(error as Error);
      }
    });
  }

  private contentWidth(doc: PDFKit.PDFDocument): number {
    return doc.page.width - doc.page.margins.left - doc.page.margins.right;
  }

  /** Draws a bordered box around whatever `renderBody` writes, growing to fit its content. */
  private box(doc: PDFKit.PDFDocument, renderBody: () => void, padding = 8): void {
    const left = doc.page.margins.left;
    const width = this.contentWidth(doc);
    const startY = doc.y;

    doc.y = startY + padding;
    renderBody();
    const endY = doc.y;

    doc
      .rect(left, startY, width, endY - startY + padding)
      .lineWidth(0.75)
      .strokeColor('#999999')
      .stroke();

    doc.y = endY + padding + 10;
    doc.x = left;
  }

  private ensureSpace(doc: PDFKit.PDFDocument, minHeight: number): void {
    const bottom = doc.page.height - doc.page.margins.bottom;
    if (doc.y + minHeight > bottom) {
      doc.addPage();
    }
  }

  private renderHeader(doc: PDFKit.PDFDocument, report: AuditReportPdfInput): void {
    const left = doc.page.margins.left;
    const width = this.contentWidth(doc);

    this.box(doc, () => {
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#333333')
        .text(report.companyName || 'EMPRESA', left + 4, doc.y);

      doc
        .font('Helvetica-Bold')
        .fontSize(15)
        .fillColor('#000000')
        .text('RELATÓRIO DE AUDITORIA & RISCO', left, doc.y - 12, { width: width - 8, align: 'right' });

      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#555555')
        .text(`Data: ${formatDate(report.executionDate)}`, left, doc.y, { width: width - 8, align: 'right' });
    });
  }

  private renderPeriodBar(doc: PDFKit.PDFDocument, report: AuditReportPdfInput): void {
    const left = doc.page.margins.left;
    const instances =
      !report.instancesAudited || report.instancesAudited.length === 0 ? 'Todas' : report.instancesAudited.join(', ');

    this.box(doc, () => {
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor('#000000')
        .text(
          `PERÍODO DE ANÁLISE: ${formatDate(report.periodStart)} a ${formatDate(report.periodEnd)}   |   INSTÂNCIAS: ${instances}`,
          left + 4,
          doc.y,
        );
    });
  }

  private renderExecutiveSummary(doc: PDFKit.PDFDocument, report: AuditReportPdfInput): void {
    const left = doc.page.margins.left;
    const width = this.contentWidth(doc);
    const summary = report.executiveSummary;

    this.ensureSpace(doc, 120);

    this.box(doc, () => {
      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor('#000000')
        .text('1. RESUMO EXECUTIVO (SÓCIO x GERENTE x ADMINISTRATIVO)', left + 4, doc.y);
      doc.moveDown(0.5);

      if (!summary) {
        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor('#555555')
          .text('Nenhum dado disponível para o período.', left + 4);
        return;
      }

      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor('#000000')
        .text('Tom da Comunicação: ', left + 4, doc.y, { continued: true, width: width - 8 })
        .font('Helvetica')
        .text(summary.communication_tone || 'N/A');

      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .text('Alinhamento Sócio <-> Gerência: ', left + 4, doc.y, { continued: true, width: width - 8 })
        .font('Helvetica')
        .text(summary.management_alignment_score || 'N/A');

      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .text('Principais Decisões:', left + 4, doc.y);
      this.renderBulletList(doc, summary.key_decisions, left + 12, width - 16);

      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .text('Gargalos Operacionais:', left + 4, doc.y);
      this.renderBulletList(doc, summary.operational_bottlenecks, left + 12, width - 16);
    });
  }

  private renderBulletList(doc: PDFKit.PDFDocument, items: string[] | undefined, x: number, width: number): void {
    if (!items || items.length === 0) {
      doc.font('Helvetica').fontSize(9).fillColor('#555555').text('— Nenhum registrado.', x, doc.y, { width });
      return;
    }

    for (const item of items) {
      doc.font('Helvetica').fontSize(9).fillColor('#333333').text(`• ${item}`, x, doc.y, { width });
    }
  }

  private renderRiskMatrix(doc: PDFKit.PDFDocument, report: AuditReportPdfInput): void {
    const left = doc.page.margins.left;
    const width = this.contentWidth(doc);

    this.ensureSpace(doc, 110);

    this.box(doc, () => {
      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor('#000000')
        .text('2. MATRIZ DE RISCO JURÍDICO & COMPLIANCE', left + 4, doc.y);
      doc.moveDown(0.5);

      const matrix = report.riskMatrix || {};
      const tileWidth = (width - 8 - 3 * 8) / 4;
      const tileHeight = 40;
      const tileY = doc.y;

      RISK_ORDER.forEach((level, index) => {
        const tileX = left + 4 + index * (tileWidth + 8);
        const count = matrix[level] ?? 0;

        doc.rect(tileX, tileY, tileWidth, tileHeight).fill(riskColor(level));
        doc
          .font('Helvetica-Bold')
          .fontSize(14)
          .fillColor('#ffffff')
          .text(String(count), tileX, tileY + 6, { width: tileWidth, align: 'center' });
        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor('#ffffff')
          .text(riskLabel(level), tileX, tileY + 24, { width: tileWidth, align: 'center' });
      });

      doc.fillColor('#000000');
      doc.y = tileY + tileHeight + 4;
      doc.x = left;
    });
  }

  private renderOccurrences(doc: PDFKit.PDFDocument, report: AuditReportPdfInput): void {
    const left = doc.page.margins.left;
    const width = this.contentWidth(doc);
    const occurrences = report.occurrencesDetails || [];

    this.ensureSpace(doc, 60);

    doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000').text('3. DETALHAMENTO DE OCORRÊNCIAS', left, doc.y);
    doc.moveDown(0.5);

    if (occurrences.length === 0) {
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#555555')
        .text('Nenhuma ocorrência de risco identificada no período analisado.', left, doc.y);
      doc.moveDown(1);
      return;
    }

    occurrences.forEach((occurrence, index) => {
      this.ensureSpace(doc, 130);

      this.box(doc, () => {
        doc
          .font('Helvetica-Bold')
          .fontSize(10)
          .fillColor(riskColor(occurrence.severity))
          .text(
            `Ocorrência #${String(index + 1).padStart(2, '0')} — Severidade: ${riskLabel(occurrence.severity)} (${occurrence.category})`,
            left + 4,
            doc.y,
            { width: width - 8 },
          );
        doc.fillColor('#000000');
        doc.moveDown(0.3);

        doc
          .font('Helvetica-Bold')
          .fontSize(9)
          .text('Interlocutores: ', left + 4, doc.y, { continued: true, width: width - 8 })
          .font('Helvetica')
          .text(occurrence.interlocutors || 'N/A');

        doc
          .font('Helvetica-Bold')
          .fontSize(9)
          .text('Evidência: ', left + 4, doc.y, { continued: true, width: width - 8 })
          .font('Helvetica-Oblique')
          .text(`"${occurrence.evidence_quote || ''}"`);

        doc
          .font('Helvetica-Bold')
          .fontSize(9)
          .text('Parecer Jurídico: ', left + 4, doc.y, { continued: true, width: width - 8 })
          .font('Helvetica')
          .text(occurrence.legal_fundamentation || 'N/A');

        doc
          .font('Helvetica-Bold')
          .fontSize(9)
          .text('Recomendação: ', left + 4, doc.y, { continued: true, width: width - 8 })
          .font('Helvetica')
          .text(occurrence.recommendation || 'N/A');
      });
    });
  }

  private renderFooterOnAllPages(doc: PDFKit.PDFDocument): void {
    const range = doc.bufferedPageRange();

    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);

      const left = doc.page.margins.left;
      const width = this.contentWidth(doc);
      const y = doc.page.height - doc.page.margins.bottom + 10;

      // Writing below the bottom margin is normally treated by PDFKit as an overflow
      // and triggers an automatic (blank) page break — temporarily lift the margin
      // so the footer can sit in that reserved space without spawning extra pages.
      const originalBottomMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;

      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor('#999999')
        .text('CONFIDENCIAL — Uso exclusivo do Departamento de Compliance / Diretoria', left, y, {
          width,
          align: 'center',
        });

      doc.page.margins.bottom = originalBottomMargin;
    }
  }
}
