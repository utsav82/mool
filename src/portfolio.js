import { isIndianIsin } from './extract.js';

const NUM = '-?(?:[0-9][0-9,]*(?:\\.[0-9]+)?|\\.[0-9]+)';
const token = `(?:${NUM}|--)`;
const suffix = count => new RegExp(`((?:${token}\\s+){${count - 1}}${token})\\s*$`);
const amount = value => value === '--' ? 0 : Number(value.replaceAll(',', ''));
const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
const sum = (rows, key) => round(rows.reduce((total, row) => total + (row[key] ?? 0), 0));
const clean = text => text.replace(/[^\x20-\x7e]/g, ' ').replace(/\s+/g, ' ').trim();
const identifier = /\bIN[A-Z0-9]{9}\d\b/;

export function classify(name, source) {
  if (source === 'NSDL' && /\bNCD\b|DEBENTURE|BOND/i.test(name)) return { type: 'Bond / NCD', exposure: 'Debt', inferred: false };
  if (/\bFUND\b|\bETF\b|\bMF\b|BEES/i.test(name)) {
    const type = /EXCHANGE TRADED|\bETF\b|BEES/i.test(name) && !/FUND OF FUND|\bFOF\b|GOLD FUND/i.test(name) ? 'ETF' : 'Mutual fund';
    let exposure = 'Unclassified';
    if (/GOLD/i.test(name)) exposure = 'Gold';
    else if (/SILVER/i.test(name)) exposure = 'Silver';
    else if (/HYBRID|BALANCED|MULTI.?ASSET/i.test(name)) exposure = 'Hybrid';
    else if (/LIQUID|MONEY MARKET|GILT|DURATION|DEBT|BOND|CREDIT RISK/i.test(name)) exposure = 'Debt';
    else if (/EQUITY|MID\s*CAP|SMALL\s*CAP|LARGE\s*CAP|FLEXI\s*CAP|NIFTY|SENSEX|ELSS/i.test(name)) exposure = 'Equity';
    return { type, exposure, inferred: exposure !== 'Unclassified' };
  }
  if (/EQUITY|ORDINARY SHARES/i.test(name)) return { type: 'Stock', exposure: 'Equity', inferred: false };
  return { type: source === 'MF' ? 'Mutual fund' : 'Unclassified', exposure: 'Unclassified', inferred: false };
}

function schemeNames(rows) {
  const names = new Map();
  let parts = [];
  let collecting = false;
  for (const { text } of rows) {
    if (/^AMC Name/.test(text)) { parts = []; collecting = false; }
    if (/^Scheme Name\s*:/.test(text)) {
      collecting = true;
      parts = [text.replace(/^Scheme Name\s*:\s*/, '').split(/Scheme Code\s*:/)[0]];
    } else if (collecting && !/^(Scheme Code|Folio No|KYC|ISIN)/.test(text)) {
      parts.push(text);
    }
    if (/^Folio No/.test(text)) collecting = false;
    const match = text.match(/^ISIN\s*:\s*(IN[A-Z0-9]{9}\d)/);
    if (match && parts.length) { names.set(match[1], parts.join(' ').trim()); parts = []; collecting = false; }
  }
  return names;
}

function isFurniture(text) {
  return !text || /^(Central Depository|A Wing|Lower Parel|FORM AND|Summary of|Investments Account|Page \d|Account Details|X$)/i.test(text)
    || /CONSOLIDATED ACCOUNT STATEMENT|ISIN ISIN|Current Frozen|Pledge|Market|^Bal\b|^Value$|^Face$|^Security\b|^Free bal|^Current Locked|^a\)|^b\)/i.test(text);
}

function dematName(rows, index, match, names) {
  const isin = match[0];
  if (names.has(isin)) return names.get(isin);
  const financial = rows[index].text.match(suffix(rows[index].source === 'CDSL' ? 7 : 3));
  const current = rows[index].text.slice(match.index + isin.length, financial?.index).trim();
  const before = [];
  for (let offset = index - 1; offset >= Math.max(0, index - 7); offset--) {
    const text = rows[offset].text;
    if (rows[offset].page !== rows[index].page || identifier.test(text) || isFurniture(text) || /STATEMENT|DP Name|BO ID/.test(text)) break;
    // NSDL current-balance cells are interleaved with the security description.
    before.unshift(text.replace(/(?:^|\s+)\d+(?:\.\d+)?\s+(?:--\s*){4,}$/, '').trim());
  }
  let preceding = before.join(' ');
  // Discard endings of the previous row when a new issuer starts on a later line.
  const boundary = before.findIndex(line => /LIMITED|\bLTD\b|\bAMC\b|FINANCE|FINSERV|MICROFIN|^NATIONAL STOCK|^NIPPON|^TATA|^HDFC|^ICICI|^WIPRO|^NTPC|^SAGILITY|^CUPID|^JIO|^PPFAS|^PURPLE|^MIDLAND|^MUFIN|^NAMRA/.test(line));
  if (boundary >= 0) preceding = before.slice(boundary).join(' ');
  else if (current) preceding = '';
  const after = [];
  for (let offset = index + 1; offset < Math.min(rows.length, index + 5); offset++) {
    const text = rows[offset].text;
    if (rows[offset].page !== rows[index].page || identifier.test(text) || isFurniture(text) || /STATEMENT|DP Name/.test(text)) break;
    if (/^(?:--\s*)+$/.test(text)) continue;
    if (/^(?:\d+(?:\.\d+)?%?\s+)?(?:SEC |NGRT |NCUM |NCD |PRT |FVRS|EQUITY SHARES|SHARES(?: WITH|$)|RE\.|1\/|RS\.|AFTER |FUND[ -]|PLAN |OPTION|INDIA ETF|EXCHANGE TRADED|ETF$|\d{2}[-.]\d{2}[-.]\d{4})/i.test(text)) {
      after.push(text.replace(/(?:--\s*)+$/, '').trim());
    } else break;
  }
  return [preceding, current, ...after].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() || isin;
}

export function parsePortfolio(pages) {
  const rows = pages.flatMap(page => page.lines.map(text => ({ text: clean(text), page: page.number })));
  const names = schemeNames(rows);
  const expected = { CDSL: null, NSDL: null, MF: null, total: null };
  const expectedPatterns = { CDSL: /^CDSL Demat Accounts\s+([\d,]+\.\d{2})$/, NSDL: /^NSDL Demat Accounts\s+([\d,]+\.\d{2})$/, MF: /^Mutual Fund Folios\s+([\d,]+\.\d{2})$/, total: /^Total Portfolio Value\s+([\d,]+\.\d{2})$/ };
  const history = [];
  for (const { text, page } of rows) {
    for (const [key, pattern] of Object.entries(expectedPatterns)) {
      const match = text.match(pattern);
      if (match && expected[key] === null) expected[key] = amount(match[1]);
    }
    const match = text.match(new RegExp(`^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (20\\d{2}) (${NUM})(?: (${NUM}) (${NUM}))?$`));
    if (match) history.push({ label: `${match[1]} ${match[2]}`, value: amount(match[3]), page });
  }
  const date = rows.map(row => row.text.match(/(?:HOLDING STATEMENT AS ON|MUTUAL FUND UNITS HELD AS ON)\s+(\d{2}-\d{2}-\d{4})/)).find(Boolean)?.[1] ?? null;
  const holdings = [];
  const issues = [];
  let source = null;
  let mode = null;
  let account = null;
  let accountIndex = 0;
  const folios = new Map();
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const text = row.text;
    if (/DEMAT ACCOUNTS HELD WITH CDSL/.test(text)) { source = 'CDSL'; mode = null; }
    if (/DEMAT ACCOUNTS HELD WITH NSDL/.test(text)) { source = 'NSDL'; mode = null; }
    if (/^DP Name\s*:/.test(text) && source) {
      accountIndex++;
      account = `${source} account ${accountIndex}`;
      mode = null;
    }
    if (/STATEMENT OF TRANSACTIONS|No Margin Re-Pledge/.test(text)) mode = null;
    if (/HOLDING STATEMENT AS ON/.test(text) && source) mode = 'demat';
    if (/MUTUAL FUND UNITS HELD WITH MF\/RTA/.test(text)) { source = 'MF'; mode = null; }
    if (/MUTUAL FUND UNITS HELD AS ON/.test(text)) { source = 'MF'; mode = 'mf'; }
    if (/^Grand Total|Load Structures/.test(text) && mode === 'mf') mode = null;
    row.source = source;
    if (!mode) continue;
    const match = text.match(identifier);
    if (!match || match[0].startsWith('INZ')) continue;
    const isin = match[0];
    let name, units, price, value, cost = null, gain = null, gainPercent = null, location;
    if (mode === 'mf') {
      const tail = text.slice(match.index + isin.length).trim();
      const parsed = tail.match(new RegExp(`^(\\d[\\d/]*)\\s+((?:${NUM}\\s+){5}${NUM})$`));
      if (!parsed) { issues.push({ page: row.page, message: 'A mutual-fund holding row could not be read.', isin }); continue; }
      const folio = parsed[1];
      if (!folios.has(folio)) folios.set(folio, `MF folio ${folios.size + 1}`);
      location = folios.get(folio);
      [units, price, cost, value, gain, gainPercent] = parsed[2].split(/\s+/).map(amount);
      name = names.get(isin) || isin;
    } else {
      const count = source === 'CDSL' ? 7 : 3;
      const parsed = text.match(suffix(count));
      if (!parsed || parsed.index < match.index + isin.length) { issues.push({ page: row.page, message: 'A demat holding row could not be read.', isin }); continue; }
      const cells = parsed[1].split(/\s+/).map(amount);
      value = cells.at(-1);
      price = cells.at(-2);
      units = source === 'CDSL' ? cells[0] : null;
      if (source === 'NSDL') {
        for (let offset = index - 1; offset >= Math.max(0, index - 3); offset--) {
          if (identifier.test(rows[offset].text)) break;
          const current = rows[offset].text.match(new RegExp(`(${NUM})\\s+(?:--\\s*){4,}$`));
          if (current) { units = amount(current[1]); break; }
        }
        // Missing current quantity is not replaced by free balance: locked units may exist.
      }
      name = dematName(rows, index, match, names);
      location = account || `${source} account`;
    }
    if (!isIndianIsin(isin)) issues.push({ page: row.page, isin, message: 'Identifier checksum needs review; this row is retained for reconciliation.' });
    if (units === null) issues.push({ page: row.page, isin, message: 'Current quantity unavailable; statement value is retained.' });
    if (units !== null && Math.abs(units * price - value) > Math.max(0.1, Math.abs(value) * 0.0001)) issues.push({ page: row.page, isin, message: 'Quantity × price differs from the reported value. Review the source.' });
    if (cost !== null && Math.abs(value - cost - gain) > 0.05) issues.push({ page: row.page, isin, message: 'Reported fund gain does not match value minus invested amount.' });
    holdings.push({ isin, name, units, price, value, cost, gain, gainPercent, source, location, page: row.page, ...classify(name, source) });
  }
  const groups = new Map();
  for (const holding of holdings) {
    if (!groups.has(holding.isin)) groups.set(holding.isin, { isin: holding.isin, name: holding.name, type: holding.type, exposure: holding.exposure, inferred: holding.inferred, positions: [] });
    groups.get(holding.isin).positions.push(holding);
  }
  const consolidated = [...groups.values()].map(group => ({ ...group, value: sum(group.positions, 'value'), units: group.positions.every(row => row.units !== null) ? group.positions.reduce((total, row) => total + row.units, 0) : null })).sort((a, b) => b.value - a.value);
  const reconciliation = ['CDSL', 'NSDL', 'MF', 'total'].map(key => {
    const actual = sum(key === 'total' ? holdings : holdings.filter(row => row.source === key), 'value');
    const difference = expected[key] === null ? null : round(actual - expected[key]);
    return { key, actual, expected: expected[key], difference, matches: difference !== null && Math.abs(difference) <= 0.05 };
  });
  const mf = holdings.filter(row => row.source === 'MF');
  const mfCost = sum(mf, 'cost');
  return { date, expected, history, holdings, consolidated, issues, reconciliation, total: sum(holdings, 'value'), complete: reconciliation.every(row => row.matches) && issues.length === 0,
    mf: { value: sum(mf, 'value'), cost: mfCost, gain: sum(mf, 'gain'), percent: mfCost > 0 ? sum(mf, 'gain') / mfCost * 100 : null, count: mf.length } };
}

export function allocation(holdings, field) {
  const totals = new Map();
  for (const holding of holdings) totals.set(holding[field], (totals.get(holding[field]) ?? 0) + holding.value);
  return [...totals].map(([label, value]) => ({ label, value: round(value) })).sort((a, b) => b.value - a.value);
}
