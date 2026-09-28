// Run with `node --test`. The functions are loaded from the shipped HTML, so
// these tests fail if production formulas change without an intentional update.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'kalkulator-zivnost-sro.html'), 'utf8');
const script = html.match(/<script>\s*(const F=[\s\S]*?)<\/script>/)?.[1];
assert.ok(script, 'Production calculation script must be present');
// Only omit the DOM startup; keep the actual calculation and validation code.
const startup = script.indexOf("['rev','costEur','mode'");
assert.ok(startup > 0, 'DOM startup must be present');
const context = vm.createContext({ Intl });
vm.runInContext(script.slice(0, startup), context, { filename: 'kalkulator-zivnost-sro.html' });
const formulas = vm.runInContext('({ ziv, sro, taxFO, validate })', context);
const call = (name, ...args) => formulas[name](...args);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.000001, `${actual} ≠ ${expected}`);

test('SZČO social insurance: cent below, on and above both 2026 limits', () => {
  for (const [revenue, scheme, insurance] of [
    [2876.89, 'bez SP', 0], [2876.90, 'bez SP', 0],
    [2876.91, 'mikroodvod', 1576.08],
    [9143.99, 'mikroodvod', 1576.08], [9144, 'mikroodvod', 1576.08],
    [9144.01, 'štandard', 3637.32],
  ]) {
    const result = call('ziv', revenue, 0, 'actual', false);
    assert.equal(result.spm, scheme, `revenue ${revenue}`);
    close(result.sp, insurance);
  }
});

test('100 000 €: small-business income tax rate includes the limit', () => {
  for (const revenue of [99999.99, 100000, 100000.01]) {
    close(call('taxFO', revenue, 10000), revenue <= 100000 ? 1500 : 1900);
    // Fix profit at 10 000 € to isolate the corporate rate from costs.
    const company = call('sro', revenue, revenue - 10000, 0, true, true, 0);
    close(company.reg, revenue <= 100000 ? 1000 : 2100);
    close(company.tax, company.reg);
  }
});

test('FO progressive brackets above 100 000 € are marginal', () => {
  close(call('taxFO', 100000.01, 43983.32), 43983.32 * .19);
  close(call('taxFO', 100000.01, 60349.21), 43983.32 * .19 + (60349.21 - 43983.32) * .25);
  close(call('taxFO', 100000.01, 75010.33), 43983.32 * .19 + (60349.21 - 43983.32) * .25 + (75010.32 - 60349.21) * .30 + .01 * .35);
});

test('5 000 000 €: corporate rate and minimum tax change above, not on, the limit', () => {
  for (const revenue of [4999999.99, 5000000, 5000000.01]) {
    const high = revenue > 5000000;
    const profitable = call('sro', revenue, revenue - 100000, 0, false, true, 0);
    close(profitable.reg, high ? 24000 : 21000);
    close(profitable.mt, high ? 11520 : 3840);
    close(profitable.tax, profitable.reg);
    const loss = call('sro', revenue, revenue + 1, 0, false, true, 0);
    close(loss.tax, high ? 11520 : 3840);
    close(loss.divtax, 0);
  }
});

test('all minimum corporate tax bands: boundary cents and first-return exemption', () => {
  for (const [limit, below, above] of [
    [50000, 340, 960], [250000, 960, 1920], [500000, 1920, 3840], [5000000, 3840, 11520],
  ]) {
    for (const r of [limit - .01, limit]) close(call('sro', r, r + 100, 0, false, true, 0).tax, below);
    close(call('sro', limit + .01, limit + 100.01, 0, false, true, 0).tax, above);
    close(call('sro', limit + .01, limit + 100.01, 0, true, true, 0).tax, 0);
  }
  close(call('sro', 0, 0, 0, false, true, 0).tax, 340);
});

test('health insurance switches, first return, DFT and extra expenses combine independently', () => {
  // 60 000 revenue, 59 000 ordinary cost, 300 extra cost and 200 DFT:
  // taxable profit 500; ordinary corporate tax 50; minimum tax 960.
  for (const zOther of [false, true]) for (const sOther of [false, true]) {
    for (const newco of [false, true]) for (const useCosts of [false, true]) {
      const extra = useCosts ? 300 : 0, dft = useCosts ? 200 : 0;
      const z = call('ziv', 60000, 59000, 'actual', zOther);
      const s = call('sro', 60000, 59000, extra, newco, sOther, dft);
      close(z.zp, zOther ? 1000 / 1.486 * .16 : 1463.04);
      close(s.profit, useCosts ? 500 : 1000);
      close(s.reg, useCosts ? 50 : 100);
      close(s.tax, newco ? s.reg : 960);
      close(s.kz, sOther ? 0 : 1463.04);
      close(s.divtax, Math.max(s.profit - s.tax, 0) * .07);
      close(s.net, s.profit - s.tax - s.divtax - s.kz);
    }
  }
});

test('DFT and extra expenses reduce company profit once; losses never pay dividend tax', () => {
  const result = call('sro', 20000, 21000, 400, 0, false, 100);
  close(result.profit, -1500);
  close(result.tax, 340);
  close(result.afterTaxCash, -1840);
  close(result.divtax, 0);
  close(result.net, -3303.04);
});

test('flat-rate expense cap affects tax base, while actual cash costs affect net result', () => {
  const a = call('ziv', 50000, 1000, 'pausal', false);
  const b = call('ziv', 50000, 3000, 'pausal', false);
  close(a.taxexp, 20000);
  close(a.tax, b.tax);
  close(a.net - b.net, 2000);
  close(call('ziv', 20000, 1000, 'pausal', false).taxexp, 12000);
});

test('invalid numerical inputs are rejected by the production validator', () => {
  for (let i = 0; i < 4; i++) {
    const values = [10000, 1000, 50, 100];
    values[i] = -1;
    assert.equal(call('validate', ...values).length, 1);
    values[i] = NaN;
    assert.equal(call('validate', ...values).length, 1);
  }
  assert.equal(call('validate', 0, 0, 0, 0).length, 0);
});
