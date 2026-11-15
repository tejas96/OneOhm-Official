/** Makes any value safe to put inside HTML text or an attribute. */
export function esc(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Text with line breaks as paragraphs, every value escaped. */
export function paragraphs(text: string): string {
  return text
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${esc(line)}</p>`)
    .join('');
}

/**
 * The page rules: no scripts, no outside files, forms only to us. Helmet's own policy would also
 * work for a page with no scripts; this one is stricter and names what the page needs.
 */
export const PAGE_POLICY = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src 'self' data:",
  "media-src 'self'",
  "form-action 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

const STYLE = `
*{box-sizing:border-box}body{margin:0;background:#f6f4ef;color:#1c1b19;font:17px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:520px;margin:0 auto;padding:16px 16px 40px}
h1{font-size:15px;letter-spacing:.04em;text-transform:uppercase;margin:4px 0 14px;color:#555}
h2{font-size:19px;margin:28px 0 10px}
img,video{display:block;width:100%;height:auto;border-radius:14px;background:#ddd}
.text p{margin:14px 0 0;font-size:19px}
.wa{display:block;margin:22px 0 0;padding:16px;border-radius:14px;background:#128c4a;color:#fff;text-align:center;font-weight:700;font-size:19px;text-decoration:none}
form{display:grid;gap:10px}label{display:grid;gap:4px;font-size:15px;color:#444}
input{font:inherit;padding:13px;border:1px solid #bbb;border-radius:10px;background:#fff}
button{font:inherit;font-weight:700;padding:15px;border:0;border-radius:14px;background:#1c1b19;color:#fff}
.err{background:#fde8e6;border:1px solid #e3a39c;color:#7a1d14;padding:12px;border-radius:10px}
.hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
footer{margin-top:30px;font-size:14px;color:#666}footer a{color:inherit}
`;

/** One whole page: a title and a body that is already escaped. */
export function pageOf(title: string, body: string): string {
  return `<!doctype html><html lang="en-IN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>${STYLE}</style></head><body><main>${body}</main></body></html>`;
}
