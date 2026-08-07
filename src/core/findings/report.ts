import { Brand, BrandColors } from '@/src/branding';

export type ReportQuantity = {
  label: string;
  text: string;
};

export type ReportMeasurement = {
  kind: string;
  label: string;
  quantities: ReportQuantity[];
};

export type ReportFinding = {
  title: string;
  type: string;
  bodySite: string;
  laterality: string;
  categoryLabel: string;
  category: string;
  description: string;
  /** Human-readable slice/frame reference. */
  location: string;
  /** Image-index coordinates of the measurement centroid. */
  coordinates: string;
  measurements: ReportMeasurement[];
  keyImage?: {
    dataURL: string;
    caption: string;
  };
};

export type ReportHeaderField = {
  label: string;
  value: string;
};

export type Report = {
  generatedAt: string;
  patient: ReportHeaderField[];
  study: ReportHeaderField[];
  series: ReportHeaderField[];
  impression: string;
  findings: ReportFinding[];
};

export type ReportRenderOptions = {
  /** The document surface. Print always uses the light surface. */
  theme?: 'dark' | 'light';
  forPrint?: boolean;
};

const NOT_RECORDED = '—';

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * A key image can come from a restored archive, so it is untrusted content
 * heading for a document that is downloaded and printed outside the app's
 * sandbox. Only a base64 raster data URL is allowed through.
 */
const IMAGE_DATA_URL_RE =
  /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

const imageSrc = (dataURL: string) =>
  IMAGE_DATA_URL_RE.test(dataURL) ? dataURL : '';

const fieldsToText = (fields: ReportHeaderField[]) =>
  fields.map(({ label, value }) => `${label}: ${value || NOT_RECORDED}`);

/** Plain-text rendering, used for copy-to-clipboard. */
export function renderReportText(report: Report): string {
  const lines: string[] = [
    Brand.productName.toUpperCase(),
    'STRUCTURED FINDINGS REPORT',
    `Generated ${report.generatedAt}`,
    '',
    ...fieldsToText(report.patient),
    ...fieldsToText(report.study),
    ...fieldsToText(report.series),
    '',
    'IMPRESSION',
    report.impression.trim() || NOT_RECORDED,
    '',
    'FINDINGS',
  ];

  if (report.findings.length === 0) {
    lines.push(NOT_RECORDED);
  }

  report.findings.forEach((finding, index) => {
    lines.push('');
    lines.push(`${index + 1}. ${finding.title}`);
    const attributes = [
      finding.type && `Type: ${finding.type}`,
      finding.bodySite && `Site: ${finding.bodySite}`,
      finding.laterality && `Laterality: ${finding.laterality}`,
      finding.category && `${finding.categoryLabel}: ${finding.category}`,
    ].filter(Boolean);
    if (attributes.length > 0) lines.push(`   ${attributes.join(' | ')}`);
    lines.push(`   Location: ${finding.location}`);
    if (finding.coordinates)
      lines.push(`   Image coordinates: ${finding.coordinates}`);
    finding.measurements.forEach((measurement) => {
      const quantities = measurement.quantities
        .map(({ label, text }) => `${label} ${text}`)
        .join(', ');
      lines.push(`   ${measurement.kind} ${measurement.label}: ${quantities}`);
    });
    if (finding.description.trim())
      lines.push(`   ${finding.description.trim()}`);
    if (finding.keyImage)
      lines.push(`   [key image: ${finding.keyImage.caption}]`);
  });

  lines.push('');
  lines.push(
    `${Brand.productName} — prototype report. Not for diagnostic use.`
  );
  return lines.join('\n');
}

const reportStyles = ({ theme, forPrint }: Required<ReportRenderOptions>) => {
  const dark = theme === 'dark' && !forPrint;
  const surface = dark ? '#12161C' : '#FFFFFF';
  const ink = dark ? '#E8ECF1' : '#1A1D21';
  const muted = dark ? '#9AA6B2' : '#5A646E';
  const rule = dark ? '#2A323C' : '#DCE3EA';
  const headerInk = dark ? BrandColors.onDark : '#FFFFFF';
  return `
  :root { color-scheme: ${dark ? 'dark' : 'light'}; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: ${dark ? '#0B0E13' : '#EEF1F5'};
    color: ${ink};
    font-family: 'Roboto', 'Helvetica Neue', Arial, sans-serif;
    font-size: 13px;
    line-height: 1.5;
  }
  .report { max-width: 900px; margin: 0 auto; background: ${surface}; }
  .report__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    padding: 20px 32px;
    background: ${BrandColors.primary};
    color: ${headerInk};
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .report__lockup { display: flex; align-items: center; gap: 12px; }
  .report__wordmark {
    font-size: 20px; font-weight: 600; letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .report__rule-v { width: 1px; height: 22px; background: currentColor; opacity: 0.4; }
  .report__product { font-size: 17px; font-weight: 300; letter-spacing: 0.02em; }
  .report__doctype {
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.14em;
    opacity: 0.85; text-align: right;
  }
  .report__accent { height: 3px; background: ${BrandColors.accent}; }
  .report__body { padding: 28px 32px 36px; }
  .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
  .meta__group { min-width: 0; }
  .meta__title {
    font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em;
    color: ${muted}; margin-bottom: 6px;
  }
  .meta__row { display: flex; gap: 6px; }
  .meta__label { color: ${muted}; white-space: nowrap; }
  .meta__value { font-weight: 500; overflow-wrap: anywhere; }
  h2 {
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.14em;
    color: ${muted}; font-weight: 600;
    margin: 28px 0 10px; padding-bottom: 6px; border-bottom: 1px solid ${rule};
  }
  .impression { white-space: pre-wrap; }
  .finding { padding: 16px 0; border-bottom: 1px solid ${rule}; page-break-inside: avoid; }
  .finding:last-child { border-bottom: none; }
  .finding__head { display: flex; align-items: baseline; gap: 10px; }
  .finding__index {
    color: ${BrandColors.primary}; font-weight: 600; font-variant-numeric: tabular-nums;
  }
  .finding__title { font-size: 15px; font-weight: 500; }
  .finding__grid { display: flex; gap: 20px; margin-top: 10px; }
  .finding__facts { flex: 1 1 auto; min-width: 0; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
  .chip {
    font-size: 11px; padding: 2px 8px; border-radius: 10px;
    border: 1px solid ${rule}; color: ${muted};
  }
  .chip--category {
    border-color: ${BrandColors.accent}; color: ${dark ? BrandColors.accent : BrandColors.primary};
  }
  table.measurements { border-collapse: collapse; width: 100%; margin-bottom: 8px; }
  table.measurements td { padding: 3px 12px 3px 0; vertical-align: top; }
  table.measurements td.label { color: ${muted}; white-space: nowrap; }
  .value { font-variant-numeric: tabular-nums; font-weight: 500; }
  .description { white-space: pre-wrap; margin-top: 6px; }
  .location { color: ${muted}; margin-top: 6px; font-size: 12px; }
  .key-image { flex: 0 0 240px; }
  .key-image img {
    width: 240px; border-radius: 2px; border: 1px solid ${rule}; display: block;
    background: #000;
  }
  .key-image figcaption { color: ${muted}; font-size: 11px; margin-top: 4px; }
  figure { margin: 0; }
  .empty { color: ${muted}; }
  .report__footer {
    margin-top: 28px; padding-top: 12px; border-top: 1px solid ${rule};
    color: ${muted}; font-size: 11px;
    display: flex; justify-content: space-between; gap: 16px;
  }
  @media print {
    body { background: #FFF; }
    .report { max-width: none; }
    @page { margin: 12mm; }
  }
`;
};

const headerFieldsHtml = (title: string, fields: ReportHeaderField[]) => `
      <div class="meta__group">
        <div class="meta__title">${escapeHtml(title)}</div>
        ${fields
          .map(
            ({ label, value }) => `<div class="meta__row">
          <span class="meta__label">${escapeHtml(label)}</span>
          <span class="meta__value">${escapeHtml(value || NOT_RECORDED)}</span>
        </div>`
          )
          .join('\n        ')}
      </div>`;

const findingHtml = (finding: ReportFinding, index: number) => {
  const chips = [finding.type, finding.bodySite, finding.laterality].filter(
    Boolean
  );
  return `
        <section class="finding">
          <div class="finding__head">
            <span class="finding__index">${index + 1}</span>
            <span class="finding__title">${escapeHtml(finding.title)}</span>
          </div>
          <div class="finding__grid">
            <div class="finding__facts">
              <div class="chips">
                ${chips
                  .map(
                    (chip) => `<span class="chip">${escapeHtml(chip)}</span>`
                  )
                  .join('\n                ')}
                ${
                  finding.category
                    ? `<span class="chip chip--category">${escapeHtml(
                        finding.categoryLabel
                      )} ${escapeHtml(finding.category)}</span>`
                    : ''
                }
              </div>
              ${
                finding.measurements.length > 0
                  ? `<table class="measurements">
                ${finding.measurements
                  .map(
                    (measurement) => `<tr>
                  <td class="label">${escapeHtml(measurement.kind)} ${escapeHtml(
                    measurement.label
                  )}</td>
                  <td>${measurement.quantities
                    .map(
                      ({ label, text }) =>
                        `${escapeHtml(label)} <span class="value">${escapeHtml(
                          text
                        )}</span>`
                    )
                    .join(' &nbsp; ')}</td>
                </tr>`
                  )
                  .join('\n                ')}
              </table>`
                  : ''
              }
              ${
                finding.description.trim()
                  ? `<div class="description">${escapeHtml(
                      finding.description.trim()
                    )}</div>`
                  : ''
              }
              <div class="location">${escapeHtml(finding.location)}${
                finding.coordinates
                  ? ` &middot; ${escapeHtml(finding.coordinates)}`
                  : ''
              }</div>
            </div>
            ${
              finding.keyImage && imageSrc(finding.keyImage.dataURL)
                ? `<figure class="key-image">
              <img src="${imageSrc(finding.keyImage.dataURL)}" alt="${escapeHtml(
                finding.keyImage.caption
              )}" />
              <figcaption>${escapeHtml(finding.keyImage.caption)}</figcaption>
            </figure>`
                : ''
            }
          </div>
        </section>`;
};

/**
 * Self-contained HTML rendering. Key images are inline data URLs, so the
 * output is a single portable file and is also what the print/PDF route
 * prints.
 */
export function renderReportHtml(
  report: Report,
  options: ReportRenderOptions = {}
): string {
  const resolved = {
    theme: options.theme ?? 'light',
    forPrint: options.forPrint ?? false,
  } as Required<ReportRenderOptions>;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(Brand.productName)} — Findings Report</title>
<style>${reportStyles(resolved)}</style>
</head>
<body>
  <article class="report">
    <header class="report__header">
      <div class="report__lockup">
        <span class="report__wordmark">${escapeHtml(Brand.company)}</span>
        <span class="report__rule-v"></span>
        <span class="report__product">${escapeHtml(
          Brand.productShortName
        )}</span>
      </div>
      <div class="report__doctype">
        Structured findings report<br />${escapeHtml(report.generatedAt)}
      </div>
    </header>
    <div class="report__accent"></div>
    <div class="report__body">
      <div class="meta">
        ${headerFieldsHtml('Patient', report.patient)}
        ${headerFieldsHtml('Study', report.study)}
        ${headerFieldsHtml('Series', report.series)}
      </div>

      <h2>Impression</h2>
      <div class="impression">${
        report.impression.trim()
          ? escapeHtml(report.impression.trim())
          : '<span class="empty">No impression recorded.</span>'
      }</div>

      <h2>Findings</h2>
      ${
        report.findings.length === 0
          ? '<div class="empty">No findings recorded.</div>'
          : report.findings.map(findingHtml).join('\n')
      }

      <footer class="report__footer">
        <span>${escapeHtml(Brand.productName)} &middot; ${escapeHtml(
          Brand.tagline
        )}</span>
        <span>Prototype output. Not for diagnostic use.</span>
      </footer>
    </div>
  </article>
</body>
</html>`;
}
