// Shared by the preview frame (preview.cckh.dev) and the tests: builds the student's page and
// decides which messages the frame accepts (ADR-09).
export const MAX_PREVIEW_BYTES = 200 * 1024;

// Runs first inside the student's page and forwards console output to the frame.
export const CONSOLE_BRIDGE = '<script>(function(){var send=function(t,a){try{parent.postMessage({__pv:1,t:t,m:Array.prototype.map.call(a,function(x){try{return typeof x==="object"?JSON.stringify(x):String(x)}catch(e){return String(x)}}).join(" ")},"*")}catch(e){}};["log","info","warn","error"].forEach(function(k){var o=console[k];console[k]=function(){send(k,arguments);o.apply(console,arguments)}});addEventListener("error",function(e){send("error",[e.message+" (line "+e.lineno+")"])})})();<\/script>';

const clean = (href) => href.replace(/^\.\//, '');
const isLocal = (href) => !/^([a-z]+:)?\/\//i.test(href) && !href.startsWith('data:');

export function buildPreviewDocument(files, bridge) {
  const byPath = new Map(files.map((f) => [f.path, f.content]));
  let html = byPath.get('index.html');
  if (html === undefined) return `${bridge}<p style="font-family:sans-serif;padding:16px">Add an index.html file to see your page.</p>`;
  html = html.replace(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi, (tag, href) =>
    isLocal(href) && clean(href).endsWith('.css') && byPath.has(clean(href)) ? `<style>${byPath.get(clean(href))}</style>` : tag);
  html = html.replace(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (tag, src) =>
    isLocal(src) && byPath.has(clean(src)) ? `<script>${byPath.get(clean(src)).replace(/<\/script/gi, '<\\/script')}</script>` : tag);
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (h) => h + bridge) : bridge + html;
}

export function acceptFilesMessage(event, lmsOrigin) {
  if (event.origin !== lmsOrigin) return false;
  const d = event.data;
  if (!d || d.__files !== 1 || !Array.isArray(d.files)) return false;
  let bytes = 0;
  for (const f of d.files) {
    if (!f || typeof f.path !== 'string' || typeof f.content !== 'string') return false;
    bytes += f.content.length;
  }
  return bytes <= MAX_PREVIEW_BYTES;
}
