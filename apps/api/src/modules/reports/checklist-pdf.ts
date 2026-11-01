import type { ChecklistItem } from '@oneohm/api-contracts';
import { assetText, formFontCss } from './report-assets';

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

const MARK: Readonly<Record<ChecklistItem['status'], string>> = {
  present: '☑',
  missing: '☐',
  ready_to_save: '◐',
  not_ready: '☐',
};

/** A one-page printable checklist: tick boxes for the papers and reports a project needs. */
export function checklistHtml(input: {
  readonly company: string;
  readonly code: string;
  readonly customer: string;
  readonly date: string;
  readonly items: readonly ChecklistItem[];
}): string {
  const rows = input.items
    .map(
      (item) =>
        `<tr><td class="mark">${MARK[item.status]}</td><td><strong>${escapeHtml(item.label)}</strong><br/><span class="why">${escapeHtml(item.why)}${item.missing.length ? ` · Missing: ${escapeHtml(item.missing.join(', '))}` : ''}</span></td><td class="kind">${item.kind === 'report' ? 'Report' : 'Paper'}</td></tr>`,
    )
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>${formFontCss()}${assetText('reports', 'report-base.css')}
  body{padding:28px 34px;font-size:12px} h1{font-size:20px;margin:0 0 4px} .meta{color:#555;margin-bottom:18px}
  table{width:100%;border-collapse:collapse} td{border-bottom:1px solid #ddd;padding:9px 6px;vertical-align:top}
  .mark{width:28px;font-size:18px} .why{color:#666} .kind{width:60px;color:#666;text-align:right}
  .legend{margin-top:16px;color:#666} .sign{margin-top:40px;display:flex;justify-content:space-between}</style></head>
  <body><h1>Document checklist · ${escapeHtml(input.code)}</h1>
  <div class="meta">${escapeHtml(input.customer)} · ${escapeHtml(input.company)} · ${escapeHtml(input.date)}</div>
  <table>${rows}</table>
  <p class="legend">☑ on file · ◐ ready to save · ☐ still needed</p>
  <div class="sign"><span>Checked by: ____________________</span><span>Date: ____________</span></div></body></html>`;
}
