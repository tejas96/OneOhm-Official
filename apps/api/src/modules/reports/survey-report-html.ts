import { formatKwp } from '@oneohm/shared';
import { assetText, formFontCss } from './report-assets';
import type { SurveyReportData } from './survey-report.data';

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

const when = (date: Date | null | undefined) =>
  date
    ? new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(date)
    : '—';

const TYPE: Readonly<Record<string, string>> = {
  residential: 'Residential',
  society: 'Housing society',
  commercial: 'Commercial',
};

export interface PrintedPhoto {
  readonly dataUri: string;
  readonly caption: string;
}

function status(data: SurveyReportData): string {
  const { task } = data;
  if (task.status === 'completed')
    return `Verified by ${escapeHtml(data.approver ?? data.surveyor ?? 'a manager')} · ${when(task.completedAt)}`;
  if (task.status === 'in_review') return 'Sent in, waiting for a manager to verify';
  return 'Survey not sent in yet';
}

const row = (label: string, value: string) =>
  `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value || '—')}</td></tr>`;

function details(data: SurveyReportData): string {
  const visit = data.checkIn
    ? `${when(data.checkIn.at)}${data.checkIn.distanceM !== null ? ` · ${data.checkIn.distanceM} m from the saved site location` : ''}`
    : 'No check-in recorded';
  return `<div class="cols"><table>${[
    row('Customer', data.customer),
    row('Mobile', data.phone),
    row('Site', data.address),
    row('Project type', TYPE[data.type] ?? data.type),
  ].join('')}</table><table>${[
    row('System', `${formatKwp(data.capacityWp)} · ${data.discom}`),
    row('Quotation', data.quotation),
    row('Surveyed by', data.surveyor ?? ''),
    row('Site check-in', visit),
  ].join('')}</table></div>`;
}

function photosHtml(photos: readonly PrintedPhoto[], more: number): string {
  if (photos.length === 0) return '<p class="muted">No photos attached.</p>';
  const cells = photos
    .map(
      (photo) =>
        `<figure><img src="${photo.dataUri}"/><figcaption>${escapeHtml(photo.caption)}</figcaption></figure>`,
    )
    .join('');
  const rest =
    more > 0 ? `<p class="muted">${more} more photos are in the project’s documents.</p>` : '';
  return `<div class="photos">${cells}</div>${rest}`;
}

/** The printable site survey report (PRD 3.4): facts, checklist, geotagged photos, notes. */
export function surveyReportHtml(input: {
  readonly company: string;
  readonly data: SurveyReportData;
  readonly photos: readonly PrintedPhoto[];
  readonly date: string;
}): string {
  const { data } = input;
  const facts = data.facts.map((fact) => row(fact.label, fact.value)).join('');
  const checks = data.checklist
    .map(
      (item) =>
        `<li><span class="mark">${item.done ? '☑' : '☐'}</span>${escapeHtml(item.label)}</li>`,
    )
    .join('');
  const others = data.otherFiles.length
    ? `<h2>Other files</h2><p>${data.otherFiles.map(escapeHtml).join(' · ')}</p>`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>${formFontCss()}${assetText('reports', 'report-base.css')}
  body{padding:26px 32px;font-size:11.5px} h1{font-size:19px;margin:0 0 3px} h2{font-size:13px;margin:18px 0 6px}
  .meta,.muted{color:#5c6168} .status{margin:12px 0 4px;padding:8px 10px;border:1px solid #d6d9dd;border-radius:6px}
  .cols{display:flex;gap:18px} .cols table{flex:1} table{width:100%;border-collapse:collapse}
  th{width:38%;text-align:left;font-weight:500;color:#5c6168} th,td{border-bottom:1px solid #e3e5e8;padding:5px 4px;vertical-align:top}
  ul{list-style:none;padding:0;margin:0} li{padding:3px 0} .mark{display:inline-block;width:20px;font-size:14px}
  .photos{display:grid;grid-template-columns:1fr 1fr;gap:10px} figure{margin:0;break-inside:avoid}
  img{width:100%;height:150px;object-fit:cover;border-radius:4px} figcaption{color:#5c6168;font-size:10px;margin-top:3px}
  .sign{margin-top:26px;display:flex;justify-content:space-between;break-inside:avoid}</style></head>
  <body><h1>Site survey report · ${escapeHtml(data.code)}</h1>
  <div class="meta">${escapeHtml(data.task.title)} · ${escapeHtml(input.company)} · ${escapeHtml(input.date)}</div>
  <div class="status">${status(data)}</div>
  ${details(data)}
  <h2>Measurements and site facts</h2><table>${facts}</table>
  <h2>Checklist</h2><ul>${checks || '<li class="muted">No checklist on this survey.</li>'}</ul>
  <h2>Notes</h2><p>${escapeHtml(data.task.note ?? '') || '<span class="muted">No notes.</span>'}</p>
  <h2>Photos</h2>${photosHtml(input.photos, data.photos.length - input.photos.length)}
  ${others}
  <div class="sign"><span>Surveyed by: ${escapeHtml(data.surveyor ?? '____________________')}</span><span>Verified by: ${escapeHtml(data.approver ?? '____________________')}</span></div></body></html>`;
}
