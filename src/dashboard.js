import { allocation } from './portfolio.js';

const moneyFormat = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const money = value => value === null || !Number.isFinite(value) ? 'Unavailable' : moneyFormat.format(value);
const percent = value => Number.isFinite(value) ? `${value.toFixed(1)}%` : 'Unavailable';
const qty = value => value === null ? 'Unavailable' : new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(value);
const colors = ['#2e5b48', '#7e9b64', '#c8aa67', '#9daeb2', '#bda8b7', '#b8bcae'];
const labels = { CDSL: 'CDSL demat', NSDL: 'NSDL demat', MF: 'MF folios', total: 'Whole statement' };
function el(tag, text = '', className = '') {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}
function card(title, subtitle) {
  const node = el('section', '', 'card');
  node.append(el('h2', title));
  if (subtitle) node.append(el('p', subtitle, 'muted'));
  return node;
}
function stat(label, value, note = '') {
  const node = el('div', '', 'metric');
  node.append(el('span', label, 'metric-label'), el('strong', value), el('small', note));
  return node;
}
function table(headers, rows) {
  const wrap = el('div', '', 'table-scroll');
  const node = el('table');
  const head = el('thead');
  const headRow = el('tr');
  for (const label of headers) { const cell = el('th', label); cell.scope = 'col'; headRow.append(cell); }
  head.append(headRow);
  const body = el('tbody');
  for (const values of rows) {
    const row = el('tr');
    for (const value of values) { const cell = el('td'); cell.append(value instanceof Node ? value : document.createTextNode(String(value))); row.append(cell); }
    body.append(row);
  }
  node.append(head, body);
  wrap.append(node);
  return wrap;
}
function bars(data, total, { limit = Infinity, names = false } = {}) {
  const root = el('div', '', 'bars');
  for (const [index, row] of data.slice(0, limit).entries()) {
    const item = el('div', '', 'bar-item');
    const top = el('div', '', 'bar-label');
    const label = names ? row.name : row.label;
    top.append(el('span', label), el('strong', `${money(row.value)} · ${percent(total > 0 ? row.value / total * 100 : 0)}`));
    const track = el('div', '', 'bar-track');
    const fill = el('div', '', 'bar-fill');
    fill.style.width = `${Math.min(100, Math.max(0, total > 0 ? row.value / total * 100 : 0))}%`;
    fill.style.background = colors[index % colors.length];
    track.append(fill); item.append(top, track); root.append(item);
  }
  if (!data.length) root.append(el('p', 'No holdings available.', 'muted'));
  return root;
}

function historyChart(history) {
  const section = card('Portfolio value over time', 'Statement-reported snapshots. Changes include money added or withdrawn; this is not an investment-return chart.');
  if (!history.length) { section.append(el('p', 'No monthly valuation history found.')); return section; }
  const selected = el('div', '', 'history-selected');
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 800 230');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Monthly portfolio value. Use the month selector or expand the accessible data table below.');
  svg.classList.add('history-chart');
  const max = Math.max(...history.map(row => row.value), 1);
  const points = history.map((row, index) => ({ x: 25 + index / Math.max(1, history.length - 1) * 750, y: 205 - row.value / max * 180 }));
  for (const ratio of [0, 0.5, 1]) {
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', '25'); line.setAttribute('x2', '775');
    line.setAttribute('y1', String(205 - ratio * 180)); line.setAttribute('y2', String(205 - ratio * 180));
    line.setAttribute('stroke', '#dfe6da'); svg.append(line);
  }
  const path = document.createElementNS(NS, 'polyline');
  path.setAttribute('points', points.map(p => `${p.x},${p.y}`).join(' '));
  path.setAttribute('fill', 'none'); path.setAttribute('stroke', '#2e5b48'); path.setAttribute('stroke-width', '3'); svg.append(path);
  const circles = points.map((point, index) => {
    const circle = document.createElementNS(NS, 'circle');
    circle.setAttribute('cx', point.x); circle.setAttribute('cy', point.y); circle.setAttribute('r', '4'); circle.setAttribute('fill', '#2e5b48');
    const title = document.createElementNS(NS, 'title'); title.textContent = `${history[index].label}: ${money(history[index].value)}`; circle.append(title); svg.append(circle); return circle;
  });
  const select = el('select');
  select.setAttribute('aria-label', 'Select statement month');
  history.forEach((row, index) => { const option = el('option', row.label); option.value = index; select.append(option); });
  function update() {
    const index = Number(select.value);
    const current = history[index];
    const change = index > 0 ? current.value - history[index - 1].value : null;
    selected.replaceChildren(el('strong', money(current.value)), el('span', `${current.label}${change === null ? ' · first available snapshot' : ` · ${change >= 0 ? '+' : ''}${money(change)} value change from previous month`}`));
    circles.forEach((circle, i) => circle.setAttribute('r', i === index ? '7' : '4'));
  }
  select.value = history.length - 1;
  select.addEventListener('change', update); update();
  const axis = el('div', '', 'chart-axis'); axis.append(el('span', `${history[0].label} · baseline ₹0`), el('span', history.at(-1).label));
  const details = el('details'); details.append(el('summary', 'View monthly values'), table(['Month', 'Statement value', 'Source page'], history.map(row => [row.label, money(row.value), row.page])));
  section.append(selected, select, svg, axis, details);
  return section;
}

function positionDetails(holding, showPage) {
  const details = el('details', '', 'position-details');
  details.append(el('summary', `${holding.positions.length} source position${holding.positions.length === 1 ? '' : 's'}`));
  details.append(table(['Location', 'Units', 'Value', 'Invested amount', 'Source'], holding.positions.map(row => {
    const button = el('button', `Page ${row.page}`, 'page-button');
    button.type = 'button'; button.addEventListener('click', () => showPage(row.page));
    return [row.location, qty(row.units), money(row.value), money(row.cost), button];
  })));
  details.append(el('p', 'Location labels are session aliases. Missing invested amounts are not treated as zero.', 'muted'));
  return details;
}

function holdingsTable(portfolio, showPage) {
  const root = card('Holdings', 'One row per ISIN. Values and quantities are combined across all statement locations.');
  root.classList.add('holdings-card');
  const controls = el('div', '', 'holding-controls');
  const searchLabel = el('label', 'Search holdings');
  const search = el('input'); search.type = 'search'; search.placeholder = 'Name or ISIN'; searchLabel.append(search);
  const typeLabel = el('label', 'Investment type'); const type = el('select');
  for (const name of ['All types', ...new Set(portfolio.consolidated.map(row => row.type))]) { const option = el('option', name); option.value = name; type.append(option); }
  typeLabel.append(type);
  const exposureLabel = el('label', 'Exposure'); const exposure = el('select');
  for (const name of ['All exposures', ...new Set(portfolio.consolidated.map(row => row.exposure))]) { const option = el('option', name); option.value = name; exposure.append(option); }
  exposureLabel.append(exposure);
  const orderLabel = el('label', 'Sort'); const order = el('select');
  for (const [value, name] of [['value', 'Largest value first'], ['name', 'Name A–Z'], ['locations', 'Most locations first']]) { const option = el('option', name); option.value = value; order.append(option); }
  orderLabel.append(order); controls.append(searchLabel, typeLabel, exposureLabel, orderLabel);
  const content = el('div'); const count = el('p', '', 'muted'); count.setAttribute('aria-live', 'polite');
  function render() {
    const query = search.value.trim().toLowerCase();
    const rows = portfolio.consolidated.filter(row => `${row.name} ${row.isin}`.toLowerCase().includes(query) && (type.value === 'All types' || row.type === type.value) && (exposure.value === 'All exposures' || row.exposure === exposure.value));
    if (order.value === 'name') rows.sort((a, b) => a.name.localeCompare(b.name));
    if (order.value === 'locations') rows.sort((a, b) => new Set(b.positions.map(position => position.location)).size - new Set(a.positions.map(position => position.location)).size || b.value - a.value);
    count.textContent = `${rows.length} of ${portfolio.consolidated.length} investments · weights use extracted holdings value`;
    content.replaceChildren(table(['Investment', 'Type / exposure', 'Units', 'Statement value', 'Weight', 'Locations'], rows.map(row => {
      const identity = el('div'); identity.append(el('strong', row.name), el('small', row.isin, 'isin'), positionDetails(row, showPage));
      const category = el('div'); category.append(el('span', row.type, 'badge'), el('small', `${row.exposure}${row.inferred ? ' · inferred' : ''}`, 'isin'));
      const weight = portfolio.total > 0 ? row.value / portfolio.total * 100 : 0;
      const weightNode = el('div', '', 'weight-cell');
      const weightBar = el('span', '', 'weight-bar'); weightBar.style.width = `${Math.min(100, Math.max(0, weight))}%`;
      weightNode.append(el('strong', percent(weight)), weightBar);
      const locations = new Set(row.positions.map(position => position.location)).size;
      return [identity, category, qty(row.units), money(row.value), weightNode, `${locations} ${locations === 1 ? 'location' : 'locations'}`];
    })));
    if (!rows.length) content.append(el('p', 'No matching investments. Try another search or type.'));
  }
  search.addEventListener('input', render); type.addEventListener('change', render); exposure.addEventListener('change', render); order.addEventListener('change', render); render();
  root.append(controls, count, content);
  return root;
}

export function renderDashboard(root, portfolio, showPage) {
  root.replaceChildren();
  const p = portfolio;
  const metrics = el('div', '', 'dashboard-metrics');
  metrics.append(stat('Statement portfolio value', money(p.expected.total), p.date ? `As of ${p.date} · not live prices` : 'Statement date unavailable'), stat('Consolidated investments', String(p.consolidated.length), `${p.holdings.length} source positions`), stat('Extracted holdings value', money(p.total), p.complete ? 'All section totals reconcile' : 'Review validation below'));
  const validation = el('div', '', `validation ${p.complete ? 'valid' : 'needs-review'}`);
  validation.append(el('strong', p.complete ? '✓ Holdings reconcile with your CAS' : 'Review needed before relying on these totals'), el('p', p.complete ? 'CDSL, NSDL, MF folios and the overall total match. This checks extraction consistency, not statement authenticity or market prices.' : 'The view below uses extracted rows and may be incomplete. Inspect the section checks and any flagged rows.'));
  const checks = el('details'); checks.open = !p.complete;
  checks.append(el('summary', 'Reconciliation & parsing checks'), table(['Section', 'CAS total', 'Extracted', 'Difference', 'Status'], p.reconciliation.map(row => [labels[row.key], money(row.expected), money(row.actual), money(row.difference), row.matches ? 'Matches' : row.expected === null ? 'No reference total' : 'Mismatch'])));
  for (const issue of p.issues) {
    const line = el('p', `${issue.isin ?? ''} · ${issue.message} `);
    const button = el('button', `Page ${issue.page}`, 'page-button'); button.addEventListener('click', () => showPage(issue.page)); line.append(button); checks.append(line);
  }
  validation.append(checks);
  root.append(metrics, validation);
  const nav = el('nav', '', 'dashboard-nav'); nav.setAttribute('aria-label', 'Portfolio views');
  const views = el('div');
  const overview = el('section'); const performance = el('section'); const concentration = el('section');
  const entries = [['Overview', overview], ['Performance', performance], ['Concentration', concentration]];
  const buttons = [];
  for (const [index, [label, panel]] of entries.entries()) {
    const button = el('button', label); button.type = 'button'; button.setAttribute('aria-pressed', String(index === 0));
    panel.hidden = index !== 0;
    button.addEventListener('click', () => entries.forEach(([, target], i) => { target.hidden = i !== index; buttons[i].setAttribute('aria-pressed', String(i === index)); }));
    buttons.push(button); nav.append(button); views.append(panel);
  }
  const grid = el('div', '', 'dashboard-grid');
  const exposure = card('Where your money is exposed', 'Broad categories inferred from security names, not underlying fund holdings. Hybrid funds remain separate; equity funds may also hold cash or debt.');
  exposure.append(bars(allocation(p.holdings, 'exposure'), p.total));
  const custody = card('Where it is held', 'Custody locations are different from asset classes. Values below come from extracted positions.');
  custody.append(bars(allocation(p.holdings, 'source').map(row => ({ ...row, label: labels[row.label] })), p.total));
  grid.append(exposure, custody);
  const overviewLayout = el('div', '', 'overview-layout');
  overviewLayout.append(holdingsTable(p, showPage), grid);
  overview.append(overviewLayout);

  const performanceInfo = el('div', '', 'notice');
  performanceInfo.textContent = 'Performance coverage is partial. Invested amounts and gains below cover MF folios only, excluding demat funds, shares and bonds. XIRR, realised profit, income and whole-portfolio returns need additional history.';
  const performanceMetrics = el('div', '', 'dashboard-metrics');
  performanceMetrics.append(stat('MF folios: reported invested amount', p.mf.count ? money(p.mf.cost) : 'Unavailable', 'As provided by the statement'), stat('MF folios: unrealised gain / loss', p.mf.count ? money(p.mf.gain) : 'Unavailable', 'Excludes realised gains and distributions'), stat('MF folios: simple gain / cost', p.mf.count ? percent(p.mf.percent) : 'Unavailable', 'Not annualised · not XIRR'));
  const mfCard = card('Reported mutual-fund gains', 'Only non-demat MF folios with reported invested amounts. Repeated ISINs are combined within this section.');
  const mfRows = p.consolidated.map(row => ({ ...row, positions: row.positions.filter(position => position.source === 'MF') })).filter(row => row.positions.length);
  mfCard.append(table(['Fund', 'Invested amount', 'Statement value', 'Unrealised gain / loss', 'Simple gain / cost'], mfRows.map(row => {
    const cost = row.positions.reduce((a, b) => a + b.cost, 0);
    const value = row.positions.reduce((a, b) => a + b.value, 0);
    const gain = row.positions.reduce((a, b) => a + b.gain, 0);
    const title = el('div'); title.append(el('strong', row.name), positionDetails(row, showPage));
    return [title, money(cost), money(value), money(gain), percent(cost > 0 ? gain / cost * 100 : NaN)];
  })));
  if (!mfRows.length) mfCard.append(el('p', 'No MF folio performance rows could be parsed.'));
  performance.append(performanceInfo, performanceMetrics, historyChart(p.history), mfCard);

  const top = p.consolidated[0];
  const largest = card('Largest investments', 'Combined by ISIN. These are direct positions, not a look-through into funds or a risk score.');
  largest.append(bars(p.consolidated, p.total, { limit: 5, names: true }));
  const topFive = p.consolidated.slice(0, 5).reduce((value, row) => value + row.value, 0);
  const concentrationMetrics = el('div', '', 'dashboard-metrics');
  const repeated = p.consolidated.filter(row => new Set(row.positions.map(position => position.location)).size > 1);
  concentrationMetrics.append(stat('Largest investment', percent(p.total > 0 && top ? top.value / p.total * 100 : NaN), top?.name ?? 'No holdings'), stat('Top five investments', percent(p.total > 0 ? topFive / p.total * 100 : NaN), 'Share of extracted holdings value'), stat('Investments in multiple locations', String(repeated.length), 'Same ISIN across account / folio aliases'));
  const repetition = card('Same investment, several places', 'These positions are combined in the overview. Multiple locations do not necessarily mean you should consolidate or sell.');
  repetition.append(table(['Investment', 'Locations', 'Combined value'], repeated.map(row => {
    const name = el('div'); name.append(el('strong', row.name), positionDetails(row, showPage));
    return [name, new Set(row.positions.map(position => position.location)).size, money(row.value)];
  })));
  if (!repeated.length) repetition.append(el('p', 'No matching ISINs across different locations detected.'));
  const metals = card('Gold & silver across products', 'Groups products explicitly named gold or silver. It does not measure exact underlying metal weights or include metals inside hybrid funds.');
  metals.append(bars(allocation(p.holdings.filter(row => ['Gold', 'Silver'].includes(row.exposure)), 'exposure'), p.total));
  const limits = card('What this statement cannot tell us yet');
  limits.append(el('p', 'Different funds may own the same companies. Measuring that overlap, combined company exposure, current bond credit risk or current valuations requires additional data. No external data is fetched by this dashboard.', 'muted'));
  concentration.append(concentrationMetrics, largest, repetition, metals, limits);
  root.append(nav, views);
}
