import { acceptFilesMessage, buildPreviewDocument, CONSOLE_BRIDGE } from './preview-doc.mjs';

const LMS = document.documentElement.dataset.lms;
const student = document.getElementById('student');

addEventListener('message', (e) => {
  if (e.source === student.contentWindow) {
    const d = e.data;
    if (d && d.__pv === 1 && typeof d.m === 'string') parent.postMessage({ __pv: 1, t: String(d.t), m: d.m.slice(0, 2000) }, LMS);
    return;
  }
  if (!acceptFilesMessage(e, LMS)) return;
  student.srcdoc = buildPreviewDocument(e.data.files, CONSOLE_BRIDGE);
});

// Carries no data, so any embedder may hear it; frame-ancestors decides who can embed us at all.
parent.postMessage({ __pvReady: 1 }, '*');
