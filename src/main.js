import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { textLines, findSecurities } from './extract.js';
import { parsePortfolio } from './portfolio.js';
import { renderDashboard } from './dashboard.js';
import './style.css';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
const $ = id => document.getElementById(id);
let task = null;
let unlock = null;
let pages = [];
let generation = 0;
const assetBase = `${import.meta.env.BASE_URL}pdf-assets/`;

function node(tag, text, className) {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

function reset() {
  generation++;
  const previous = task;
  task = null;
  unlock = null;
  pages = [];
  $('password').value = '';
  $('password-form').hidden = true;
  $('results').hidden = true;
  $('dashboard').replaceChildren();
  $('workspace-nav').replaceChildren();
  document.body.classList.remove('workspace-open');
  $('extraction').open = false;
  $('open-panel').hidden = false;
  document.querySelector('.intro').hidden = false;
  $('cancel').hidden = true;
  $('pdf').disabled = false;
  $('pdf').value = '';
  $('statement-text').replaceChildren();
  $('securities').replaceChildren();
  $('document-name').textContent = '';
  $('search').value = '';
  if (previous) void previous.destroy().catch(() => {});
}

function renderText() {
  const query = $('search').value.trim().toLowerCase();
  const fragment = document.createDocumentFragment();
  for (const page of pages) {
    const lines = page.lines.filter(line => line.toLowerCase().includes(query));
    if (!lines.length) continue;
    const section = node('section', '', 'text-page');
    section.id = `source-page-${page.number}`;
    section.append(node('h3', `Page ${page.number}`), node('pre', lines.join('\n')));
    fragment.append(section);
  }
  if (!fragment.childNodes.length) fragment.append(node('p', 'No matching text.'));
  $('statement-text').replaceChildren(fragment);
}

$('pdf').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  reset();
  const run = generation;
  if (file.size > 30 * 1024 * 1024) { $('status').textContent = 'Choose a PDF smaller than 30 MB.'; return; }
  $('cancel').hidden = false;
  $('pdf').disabled = true;
  $('status').textContent = 'Opening PDF on your device…';
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    if (run !== generation) return;
    const loadingTask = pdfjs.getDocument({ data, isEvalSupported: false, cMapUrl: `${assetBase}cmaps/`, cMapPacked: true, standardFontDataUrl: `${assetBase}standard_fonts/`, wasmUrl: `${assetBase}wasm/` });
    task = loadingTask;
    loadingTask.onPassword = (callback, reason) => {
      if (run !== generation) return;
      unlock = callback;
      $('password-form').hidden = false;
      $('status').textContent = reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD ? 'That password did not unlock the PDF. Try again.' : 'This PDF is protected. Enter its password below.';
      $('password').focus();
    };
    const pdfDocument = await loadingTask.promise;
    if (run !== generation) return;
    $('password-form').hidden = true;
    $('password').value = '';
    unlock = null;
    if (pdfDocument.numPages > 500) throw new Error('page-limit');
    const extracted = [];
    for (let number = 1; number <= pdfDocument.numPages; number++) {
      if (run !== generation) return;
      $('status').textContent = `Reading page ${number} of ${pdfDocument.numPages} locally…`;
      const page = await pdfDocument.getPage(number);
      const content = await page.getTextContent();
      extracted.push({ number, lines: textLines(content.items) });
      page.cleanup();
    }
    if (run !== generation) return;
    pages = extracted;
    const securities = findSecurities(pages);
    $('page-count').textContent = String(pages.length);
    $('isin-count').textContent = String(securities.length);
    $('document-name').textContent = file.name;
    for (const security of securities) {
      const row = node('div', '', 'security');
      row.append(node('strong', security.isin), node('span', security.context), node('small', `Page ${security.page}`));
      $('securities').append(row);
    }
    if (!securities.length) $('securities').append(node('p', 'No ISINs detected. Review the text below; this does not mean the statement has no investments.'));
    renderText();
    renderDashboard($('dashboard'), parsePortfolio(pages), number => {
      $('search').value = '';
      renderText();
      $('extraction').open = true;
      const source = $(`source-page-${number}`);
      if (source) { source.tabIndex = -1; source.focus({ preventScroll: true }); source.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
    $('workspace-nav').replaceChildren($('dashboard').querySelector('.dashboard-nav'));
    document.body.classList.add('workspace-open');
    $('results').hidden = false;
    $('open-panel').hidden = true;
    document.querySelector('.intro').hidden = true;
    $('clear').focus({ preventScroll: true });
    $('status').textContent = pages.some(page => page.lines.length) ? 'Statement opened locally. Review the extracted text below.' : 'No readable text found. This may be a scanned PDF; image recognition is not supported yet.';
    await loadingTask.destroy();
    if (task === loadingTask) task = null;
  } catch (error) {
    if (run !== generation) return;
    reset();
    $('status').textContent = error.message === 'page-limit' ? 'This reader supports statements up to 500 pages.' : 'Could not read this PDF. It may be damaged or use an unsupported format. Try another statement.';
  } finally {
    if (run === generation) { $('pdf').value = ''; $('pdf').disabled = false; $('cancel').hidden = true; }
  }
});
$('password-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!unlock) return;
  const password = $('password').value;
  $('password').value = '';
  $('status').textContent = 'Unlocking locally…';
  unlock(password);
});
$('search').addEventListener('input', renderText);
function clearStatement() {
  reset();
  $('status').textContent = 'Statement cleared. Choose a PDF to start again.';
  $('pdf').focus();
}
$('clear').addEventListener('click', clearStatement);
$('cancel').addEventListener('click', clearStatement);

$('source-link').addEventListener('click', () => {
  $('extraction').open = true;
  $('extraction').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('extraction').querySelector('summary').focus({ preventScroll: true });
});
