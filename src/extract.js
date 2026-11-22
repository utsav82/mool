// Preserve approximate PDF rows, keeping page boundaries for source review.
export function textLines(items) {
  const rows = [];
  for (const item of items) {
    if (!item.str?.trim() || !item.transform) continue;
    const y = item.transform[5];
    let row = rows.find(row => Math.abs(row.y - y) <= 2);
    if (!row) { row = { y, items: [] }; rows.push(row); }
    row.items.push({ x: item.transform[4], text: item.str });
  }
  return rows.sort((a, b) => b.y - a.y).map(row => row.items.sort((a, b) => a.x - b.x).map(item => item.text).join(' ').replace(/\s+/g, ' ').trim());
}

export function isIndianIsin(value) {
  // INZ is a SEBI stock-broker registration prefix, not a security identifier.
  if (!/^IN[A-Z0-9]{9}[0-9]$/.test(value) || value.startsWith('INZ')) return false;
  const digits = [...value].map(char => /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char).join('');
  let sum = 0;
  for (let index = digits.length - 1, position = 0; index >= 0; index--, position++) {
    let digit = Number(digits[index]);
    if (position % 2 === 1) digit *= 2;
    sum += digit > 9 ? digit - 9 : digit;
  }
  return sum % 10 === 0;
}

export function findSecurities(pages) {
  const securities = new Map();
  for (const page of pages) {
    for (const line of page.lines) {
      for (const match of line.matchAll(/\bIN[A-Z0-9]{9}[0-9]\b/g)) {
        const isin = match[0];
        if (!isIndianIsin(isin)) continue;
        if (!securities.has(isin)) securities.set(isin, { isin, page: page.number, context: line });
      }
    }
  }
  return [...securities.values()];
}
