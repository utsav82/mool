import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { parsePortfolio } from '../src/portfolio.js';
import { renderDashboard } from '../src/dashboard.js';

test('dashboard switches views, filters holdings and links to source pages', () => {
  const dom = new JSDOM('<div id="root"></div>');
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  try {
    const fixture = JSON.parse(readFileSync(new URL('./fixtures/cdsl.json', import.meta.url), 'utf8'));
    const p = parsePortfolio(fixture);
    const root = document.getElementById('root');
    let sourcePage;
    renderDashboard(root, p, page => { sourcePage = page; });
    assert.match(root.textContent, /Holdings reconcile/);
    assert.ok(root.querySelector('.holdings-card').compareDocumentPosition(root.querySelector('.dashboard-grid')) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
    assert.match(root.querySelector('.holdings-card thead').textContent, /Locations/);
    assert.equal(root.querySelectorAll('.dashboard-nav button').length, 3);
    const nav = root.querySelectorAll('.dashboard-nav button');
    nav[1].click();
    assert.equal(nav[1].getAttribute('aria-pressed'), 'true');
    assert.equal(nav[0].getAttribute('aria-pressed'), 'false');
    assert.match(root.textContent, /not an investment-return chart/);
    const month = root.querySelector('select[aria-label="Select statement month"]');
    month.value = '0'; month.dispatchEvent(new dom.window.Event('change'));
    assert.match(root.querySelector('.history-selected').textContent, /Nov 2025/);
    nav[0].click();
    const search = root.querySelector('input[type=search]');
    search.value = 'no match'; search.dispatchEvent(new dom.window.Event('input'));
    assert.match(root.textContent, /No matching investments/);
    search.value = 'EXAMPLE INDUSTRIES'; search.dispatchEvent(new dom.window.Event('input'));
    const exposure = [...root.querySelectorAll('.holding-controls select')][1];
    exposure.value = 'Debt'; exposure.dispatchEvent(new dom.window.Event('change'));
    assert.match(root.textContent, /No matching investments/);
    exposure.value = 'All exposures'; exposure.dispatchEvent(new dom.window.Event('change'));
    root.querySelector('.page-button').click();
    assert.equal(sourcePage, 3);
    // PDF labels are rendered as text, never interpreted as HTML.
    p.consolidated[0].name = '<img src=x onerror=alert(1)>';
    renderDashboard(root, p, () => {});
    assert.equal(root.querySelector('img'), null);
    assert.ok(root.textContent.includes('<img src=x onerror=alert(1)>'));
    root.replaceChildren();
    assert.equal(root.textContent, '');
  } finally { dom.window.close(); delete globalThis.document; delete globalThis.Node; }
});

test('dashboard surfaces mismatches and handles a statement with no holdings', () => {
  const dom = new JSDOM('<div id="root"></div>');
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  try {
    const root = document.getElementById('root');
    renderDashboard(root, parsePortfolio([]), () => {});
    assert.match(root.textContent, /Review needed/);
    assert.match(root.textContent, /Unavailable/);
    assert.equal(root.querySelector('.validation details').open, true);
    assert.ok(!root.textContent.includes('NaN'));
    assert.ok(!root.textContent.includes('Infinity'));
  } finally { dom.window.close(); delete globalThis.document; delete globalThis.Node; }
});
