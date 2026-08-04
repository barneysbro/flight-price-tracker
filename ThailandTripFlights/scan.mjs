import assert from 'node:assert/strict';
import { appendFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const CSV = 'results.csv';
const NO_FLIGHTS_CSV = 'no-flights.csv';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const iso = date => date.toISOString().slice(0, 10);
const csv = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
const csvValues = line => [...line.trimEnd().matchAll(/"((?:""|[^"])*)"(?:,|$)/g)].map(x => x[1].replaceAll('""', '"'));
const taipeiDay = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
};

export function urlFor(departure, returning, _origin = 'TPE', destination = 'BKK') {
  const code = destination.toLowerCase();
  return `https://tw.trip.com/flights/taipei-to-bangkok/tickets-tpe-${code}/?ddate=${departure}&rdate=${returning}&flighttype=d&departcityurl=taipei&arrivalcityurl=bangkok&departcitycode=tpe&arrivalcitycode=${code}&sort=price&quantity=2&curr=TWD`;
}

async function openBrowser() {
  try { return { browser: await puppeteer.connect({ browserURL: 'http://localhost:9222', defaultViewport: null }), launched: false }; }
  catch {
    const executablePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    return { browser: await puppeteer.launch({ executablePath, headless: false, userDataDir: '.chrome-profile', args: ['--lang=en-US'] }), launched: true };
  }
}

function parseDuration(text) {
  const match = text.match(/(?:(\d+)\s*(?:h|小時))?\s*(?:(\d+)\s*(?:m|分(?:鐘)?))?/);
  return match ? Number(match[1] || 0) * 60 + Number(match[2] || 0) : 0;
}

async function query(page, departure, returning, destination) {
  console.log(`查詢 Trip.com｜TPE → ${destination}｜${departure} → ${returning}`);
  await page.goto(urlFor(departure, returning, 'TPE', destination), { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('[data-testid^="u-flight-card-"]'), { timeout: 60000 });
  await sleep(2500);
  const flights = await page.$$eval('[data-testid^="u-flight-card-"]', (cards, destination) => cards.flatMap(card => {
    const baggage = card.querySelector('[data-label*="FREE_CHECKED_BAGGAGE"]');
    if (!baggage || !/Nonstop|直飛/.test(card.innerText) || !card.innerText.includes(destination)) return [];
    const times = [...card.querySelectorAll('[data-testid^="flight-time-"]')].map(x => x.textContent.trim());
    const duration = card.querySelector('[data-testid="flightInfoDuration"]')?.textContent.trim() || '';
    const priceText = [...card.querySelectorAll('[data-testid^="flight_price_"]')].map(x => x.textContent).join(' ') || card.innerText;
    const price = Number((priceText.match(/TWD\s*([\d,]+)/)?.[1] || '').replaceAll(',', ''));
    return price ? [{ carrier: card.querySelector('[data-testid="flights-name"]')?.textContent.trim() || '', times, duration, price }] : [];
  }), destination);
  const flight = flights.sort((a, b) => a.price - b.price)[0];
  if (!flight) return { status: 'no flights' };
  const minutes = parseDuration(flight.duration);
  return {
    carrier: flight.carrier,
    outbound: `${flight.times[0]} – ${flight.times[1]}`,
    returning: '選擇去程後由 tw.trip.com 確認',
    outboundDuration: /小時|分/.test(flight.duration) ? flight.duration : flight.duration.replace('h', ' 小時 ').replace('m', ' 分鐘').trim(),
    returnDuration: '',
    totalMinutes: minutes,
    price: flight.price * 2,
    status: 'ok',
  };
}

async function main() {
  const [fromArg, toArg, daysArg = '5,6', destinationArg = 'BKK'] = process.argv.slice(2);
  const destination = destinationArg.toUpperCase();
  const refresh = process.argv.includes('--refresh') || process.argv.includes('--force');
  if (!fromArg || !toArg || !['BKK', 'DMK'].includes(destination)) throw new Error('用法: node scan.mjs 2026-10-01 2026-10-31 5,6 BKK');
  const from = new Date(`${fromArg}T00:00:00Z`);
  const to = new Date(`${toArg}T00:00:00Z`);
  const durations = daysArg.split(',').map(Number).sort((a, b) => a - b);
  let old = '', noFlights = '';
  try { old = await readFile(CSV, 'utf8'); } catch {}
  try { noFlights = await readFile(NO_FLIGHTS_CSV, 'utf8'); } catch {}
  const today = taipeiDay(new Date());
  const keys = text => new Set(text.split('\n').slice(1).flatMap(line => {
    const values = csvValues(line);
    return values.length && taipeiDay(values.at(-1)) === today ? [values.slice(0, 6).join(',')] : [];
  }));
  const done = keys(old), unavailable = keys(noFlights);
  const { browser, launched } = await openBrowser();
  const page = await browser.newPage();
  try {
    for (let date = from; date <= to; date = new Date(date.getTime() + 86400000)) {
      const departure = iso(date);
      for (const days of durations) {
        const returning = iso(new Date(date.getTime() + (days - 1) * 86400000));
        const key = `TRIP,TPE,${destination},${departure},${returning},${days}`;
        if (!refresh && (done.has(key) || unavailable.has(key))) continue;
        let result;
        try { result = await query(page, departure, returning, destination); }
        catch (error) { result = { status: `error: ${error.message}` }; }
        const checkedAt = new Date().toISOString();
        if (result.status === 'no flights') {
          await appendFile(NO_FLIGHTS_CSV, `${['TRIP', 'TPE', destination, departure, returning, days, checkedAt].map(csv).join(',')}\n`);
          continue;
        }
        const row = ['TRIP', 'TPE', destination, departure, returning, days, result.carrier, result.outbound, result.returning, result.outboundDuration, result.returnDuration, result.totalMinutes, result.price, result.status, checkedAt];
        await appendFile(CSV, `${row.map(csv).join(',')}\n`);
        console.log(row.join(' | '));
      }
    }
  } finally {
    if (!launched) await page.close();
    launched ? await browser.close() : await browser.disconnect();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === '--self-test') {
    assert.match(urlFor('2026-10-01', '2026-10-08', 'TPE', 'DMK'), /^https:\/\/tw\.trip\.com\/.*arrivalcitycode=dmk/);
    assert.equal(parseDuration('3h 55m'), 235);
    assert.equal(parseDuration('3 小時 55 分'), 235);
    console.log('ok');
  } else await main();
}
