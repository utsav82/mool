import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textLines, findSecurities, isIndianIsin } from '../src/extract.js';
test('reconstructs rows in reading order despite PDF item order', () => {
  const item = (str, x, y) => ({ str, transform: [1, 0, 0, 1, x, y] });
  assert.deepEqual(textLines([item('10 units', 200, 100), item('Heading', 10, 200), item('Fund', 10, 101)]), ['Heading', 'Fund 10 units']);
});
test('validates ISIN check digits and excludes broker registrations', () => {
  assert.equal(isIndianIsin('INE002A01018'), true);
  assert.equal(isIndianIsin('INE002A01019'), false);
  assert.equal(isIndianIsin('INZ000208032'), false);
  assert.deepEqual(findSecurities([{ number: 1, lines: ['INZ000208032', 'INE002A01019'] }]), []);
});
test('deduplicates identifiers across pages and preserves first source', () => {
  const pages = [{number: 1, lines: ['Example INE002A01018 10', 'INF179K01BE2 20', 'BADINE002A01018X']}, {number: 2, lines: ['INE002A01018 12']}];
  const results = findSecurities(pages);
  assert.equal(results.length, 2);
  assert.deepEqual(results[0], {isin:'INE002A01018', page:1, context:'Example INE002A01018 10'});
});
