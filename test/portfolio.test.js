import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePortfolio, classify, allocation } from '../src/portfolio.js';
const fixture = () => JSON.parse(readFileSync(new URL('./fixtures/cdsl.json', import.meta.url), 'utf8'));

test('reconciles all sections, excludes transaction rows, combines cross-custody ISINs', () => {
  const p = parsePortfolio(fixture());
  assert.equal(p.complete, true);
  assert.equal(p.total, 400);
  assert.equal(p.holdings.length, 4);
  assert.equal(p.consolidated.length, 3);
  assert.equal(p.date, '31-12-2025');
  assert.ok(p.reconciliation.every(row => row.matches));
  const fund = p.consolidated.find(row => row.isin === 'INF179K01BE2');
  assert.equal(fund.value, 100);
  assert.equal(fund.units, 10);
  assert.equal(new Set(fund.positions.map(row => row.location)).size, 2);
  assert.equal(fund.exposure, 'Gold');
  assert.equal(p.history.length, 2);
  assert.equal(p.history[1].value, 400);
});

test('performance includes only reported MF folio costs, never demat values', () => {
  const p = parsePortfolio(fixture());
  assert.deepEqual(p.mf, { cost: 50, value: 60, gain: 10, percent: 20, count: 1 });
  assert.ok(p.holdings.filter(row => row.source !== 'MF').every(row => row.cost === null));
});

test('detects a missing row without adjusting or inventing holdings', () => {
  const pages = fixture();
  pages[3].lines = pages[3].lines.filter(line => !line.startsWith('INF179K01BE2 EXAMPLE'));
  const p = parsePortfolio(pages);
  assert.equal(p.complete, false);
  assert.equal(p.total, 360);
  assert.equal(p.reconciliation.find(row => row.key === 'CDSL').difference, -40);
});

test('flags malformed holding rows and retains checksum failures for review', () => {
  const pages = fixture();
  pages[2].lines.push('INE002A01019 malformed holding row');
  const p = parsePortfolio(pages);
  assert.equal(p.complete, false);
  assert.match(p.issues[0].message, /could not be read/);
  pages[2].lines.pop();
  pages[2].lines[6] = pages[2].lines[6].replace('INE002A01018', 'INE002A01019');
  const invalid = parsePortfolio(pages);
  assert.equal(invalid.total, 400);
  assert.equal(invalid.complete, false);
  assert.ok(invalid.issues.some(issue => /checksum/.test(issue.message)));
});

test('does not use NSDL free balance as current quantity when it is missing', () => {
  const pages = fixture();
  pages[3].lines = pages[3].lines.map(line => line.replace('EXAMPLE FINANCE LIMITED 1 -- -- -- --', 'EXAMPLE FINANCE LIMITED'));
  const p = parsePortfolio(pages);
  const bond = p.holdings.find(row => row.source === 'NSDL');
  assert.equal(bond.units, null);
  assert.equal(bond.value, 100);
  assert.ok(p.issues.some(issue => /Current quantity/.test(issue.message)));
});

test('handles Indian number grouping, fractional quantities and negative MF gains', () => {
  const pages = fixture();
  pages[4].lines[2] = 'Example Gold Fund INF179K01BE2 111/01 .500 10.0000 1,000.00 5.00 -995.00 -99.50';
  const p = parsePortfolio(pages);
  assert.equal(p.mf.cost, 1000);
  assert.equal(p.mf.gain, -995);
  assert.equal(p.holdings.at(-1).units, 0.5);
});

test('sums separate folios of the same fund without deduplicating positions', () => {
  const pages = fixture();
  pages[4].lines.splice(3, 0, 'Example Gold Fund INF179K01BE2 222/02 2.000 10.0000 15.00 20.00 5.00 33.33');
  const p = parsePortfolio(pages);
  const fund = p.consolidated.find(row => row.isin === 'INF179K01BE2');
  assert.equal(fund.positions.length, 3);
  assert.equal(fund.value, 120);
  assert.equal(fund.units, 12);
});

test('classifies funds by names with explicit uncertainty and keeps hybrid funds separate', () => {
  assert.equal(classify('Example Silver ETF Fund of Fund Direct Growth', 'MF').type, 'Mutual fund');
  assert.equal(classify('Example Silver ETF', 'CDSL').type, 'ETF');
  assert.equal(classify('Example Conservative Hybrid Fund', 'MF').exposure, 'Hybrid');
  assert.equal(classify('Example 12 NCD', 'NSDL').type, 'Bond / NCD');
  assert.equal(classify('INE002A01018', 'CDSL').exposure, 'Unclassified');
  assert.equal(allocation(parsePortfolio(fixture()).holdings, 'exposure').reduce((sum, row) => sum + row.value, 0), 400);
});

test('unknown and empty formats cannot appear reconciled', () => {
  assert.equal(parsePortfolio([]).complete, false);
  assert.equal(parsePortfolio([{number:1,lines:['Not a CAS', 'INE002A01018']}]).holdings.length, 0);
});
