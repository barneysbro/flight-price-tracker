import assert from 'node:assert/strict';
import { appendFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const TEMPLATE = 'CBwQAhoiEgoyMDI2LTEwLTAxMgJDWmoHCAESA1RQRXIHCAESA01BRBoiEgoyMDI2LTEwLTA4MgJDWmoHCAESA01BRHIHCAESA1RQRUABQAFIAXABggELCP___________wGYAQE';
const CSV = 'results.csv';
const NO_FLIGHTS_CSV = 'no-flights.csv';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const iso = date => date.toISOString().slice(0, 10);
const taipeiDay = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
};
const csvValues = line => [...line.trimEnd().matchAll(/"((?:""|[^"])*)"(?:,|$)/g)].map(x => x[1].replaceAll('""', '"'));

async function openBrowser() {
  try {
    return { browser: await puppeteer.connect({ browserURL: 'http://localhost:9222', defaultViewport: null }), launched: false };
  } catch {
    const executablePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    return { browser: await puppeteer.launch({ executablePath, headless: false, userDataDir: '.chrome-profile', args: ['--lang=zh-TW'] }), launched: true };
  }
}

export function urlFor(departure, returning, origin = 'TPE', destination = 'MAD', airline = 'CZ') {
  const airlineCodes = (Array.isArray(airline) ? airline : airline.split('+')).sort();
  const airlineFields = airlineCodes.map(code => `2\x02${code}`).join('');
  const legLength = String.fromCharCode(34 + (airlineCodes.length - 1) * 4);
  const bytes = Buffer.from(TEMPLATE, 'base64url').toString('latin1')
    .replace('2026-10-01', departure)
    .replace('2026-10-08', returning)
    .replaceAll('TPE', origin)
    .replaceAll('MAD', destination)
    .replaceAll('\x1a"', `\x1a${legLength}`)
    .replaceAll('2\x02CZ', airlineFields);
  return `https://www.google.com/travel/flights/search?tfs=${Buffer.from(bytes, 'latin1').toString('base64url')}&tfu=EgYIABAAGAA&hl=zh-TW&curr=TWD`;
}

function parseCard(text) {
  const lines = text.replaceAll('\u00a0', ' ').split('\n').map(s => s.trim()).filter(Boolean);
  const price = Number((text.match(/\$([\d,]+)\s*\n?來回票價/)?.[1] || '').replaceAll(',', ''));
  const times = lines.filter(line => /^(?:凌晨|清晨|上午|中午|下午|傍晚|晚上|午夜)?\d{1,2}:\d{2}(?:\+\d+)?$/.test(line));
  const airline = lines.find(line => !line.includes('機場') && /航空|Airlines?|Airways?/i.test(line)) || '';
  const duration = lines.find(line => /^\d+ 小時(?: \d+ 分鐘)?$/.test(line)) || '';
  const match = duration.match(/(\d+) 小時(?: (\d+) 分鐘)?/);
  return { time: times.length >= 2 ? `${times[0]} – ${times[1]}` : '', airline, duration, minutes: match ? Number(match[1]) * 60 + Number(match[2] || 0) : 0, price };
}

async function cards(page) {
  const texts = await page.$$eval('.yR1fYc', nodes => [...new Set(nodes.filter(n => n.offsetParent && n.innerText.includes('來回票價')).map(n => n.innerText))]);
  return texts.map(parseCard).filter(x => x.price && x.time && x.airline).sort((a, b) => a.price - b.price);
}

async function waitUntil(page, check, timeout = 60000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { if (await page.evaluate(check)) return; } catch {}
    await sleep(500);
  }
  throw new Error(`等待搜尋結果超時 (${timeout / 1000}s)`);
}

async function waitForResults(page) {
  await waitUntil(page, () => {
    const text = document.body.innerText;
    return document.querySelector('.yR1fYc') || text.includes('找不到任何結果') || text.includes('找不到符合篩選條件');
  });
  await sleep(1000);
}

async function query(page, departure, returning, origin, destination, airline) {
  console.log(`查詢 ${airline}｜${origin} → ${destination}｜${departure} → ${returning}`);
  await page.goto(urlFor(departure, returning, origin, destination, airline), { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitForResults(page);
  const outbound = (await cards(page))[0];
  if (!outbound) return { status: 'no flights' };

  const selected = await page.$$('.yR1fYc');
  for (const card of selected) {
    if (await card.evaluate((node, price) => node.offsetParent && node.innerText.includes(`$${price.toLocaleString('en-US')}`) && node.innerText.includes('來回票價'), outbound.price)) {
      await card.evaluate(node => node.click());
      break;
    }
  }
  await waitUntil(page, () => document.body.innerText.includes('選擇返回臺北市的行程'));
  await sleep(1000);
  const returningFlight = (await cards(page))[0];
  return returningFlight
    ? { carrier: outbound.airline, outbound: outbound.time, returning: returningFlight.time, outboundDuration: outbound.duration, returnDuration: returningFlight.duration, totalMinutes: outbound.minutes + returningFlight.minutes, price: returningFlight.price, status: 'ok' }
    : { outbound: outbound.time, outboundDuration: outbound.duration, price: outbound.price, status: 'no return flight' };
}

const csv = value => `"${String(value ?? '').replaceAll('"', '""')}"`;

async function main() {
  const [fromArg, toArg, daysArg = '8,9,10', destinationArg = 'MAD', airlineArg = 'CZ'] = process.argv.slice(2);
  const refresh = process.argv.includes('--refresh') || process.argv.includes('--force');
  const origin = 'TPE';
  const destination = (destinationArg.startsWith('--') ? 'MAD' : destinationArg).toUpperCase();
  const airline = (airlineArg.startsWith('--') ? 'CZ' : airlineArg).toUpperCase().split('+').sort().join('+');
  if (!fromArg || !toArg || !/^[A-Z]{3}$/.test(destination) || !/^[A-Z0-9]{2}(?:\+[A-Z0-9]{2})*$/.test(airline) || airline.split('+').includes('MU')) throw new Error('用法: node scan.mjs 2026-10-01 2026-12-31 8,9,10 MAD CA+ZH');
  const from = new Date(`${fromArg}T00:00:00Z`);
  const to = new Date(`${toArg}T00:00:00Z`);
  const durations = daysArg.split(',').map(Number).sort((a, b) => a - b);

  let old = '';
  let noFlights = '';
  try { old = await readFile(CSV, 'utf8'); } catch {}
  try { noFlights = await readFile(NO_FLIGHTS_CSV, 'utf8'); } catch {}
  if (!old) await appendFile(CSV, 'airline,origin,destination,departure,return,days,carrier,outbound_time,return_time,outbound_duration,return_duration,total_minutes,total_twd,status,checked_at\n');
  if (!noFlights) await appendFile(NO_FLIGHTS_CSV, 'airline,origin,destination,departure,return,days,checked_at\n');
  const today = taipeiDay(new Date());
  const done = new Set(old.split('\n').slice(1).flatMap(line => {
    const values = csvValues(line);
    return values.length && !values.at(-2).startsWith('error:') && taipeiDay(values.at(-1)) === today ? [values.slice(0, 6).join(',')] : [];
  }));
  const checkedNoFlights = new Set(noFlights.split('\n').slice(1).flatMap(line => {
    const values = csvValues(line);
    return values.length && taipeiDay(values.at(-1)) === today ? [values.slice(0, 6).join(',')] : [];
  }));

  const { browser, launched } = await openBrowser();
  const page = await browser.newPage();
  try {
    for (let date = from; date <= to; date = new Date(date.getTime() + 86400000)) {
      const departure = iso(date);
      for (const days of durations) {
        const returning = iso(new Date(date.getTime() + (days - 1) * 86400000));
        const key = `${airline},${origin},${destination},${departure},${returning},${days}`;
        if (!refresh && (done.has(key) || checkedNoFlights.has(key))) continue;
        let result;
        try { result = await query(page, departure, returning, origin, destination, airline); }
        catch (error) { result = { status: `error: ${error.message}` }; }
        const checkedAt = new Date().toISOString();
        if (result.status === 'no flights') {
          const row = [airline, origin, destination, departure, returning, days, checkedAt];
          await appendFile(NO_FLIGHTS_CSV, `${row.map(csv).join(',')}\n`);
          checkedNoFlights.add(key);
          console.log(`${row.join(' | ')} | no flights`);
          continue;
        }
        const row = [airline, origin, destination, departure, returning, days, result.carrier, result.outbound, result.returning, result.outboundDuration, result.returnDuration, result.totalMinutes, result.price, result.status, checkedAt];
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
    assert.equal(taipeiDay('invalid'), '');
    assert.deepEqual(csvValues('"CZ","2026-07-30T15:59:00Z"\r'), ['CZ', '2026-07-30T15:59:00Z']);
    assert.equal(taipeiDay('2026-07-30T15:59:00Z'), '2026-07-30');
    assert.equal(taipeiDay('2026-07-30T16:01:00Z'), '2026-07-31');
    assert.match(urlFor('2026-11-01', '2026-11-08', 'TPE', 'ROM', ['ZH', 'CA']), /tfs=/);
    const decoded = Buffer.from(new URL(urlFor('2026-11-01', '2026-11-08', 'TPE', 'ROM', ['ZH', 'CA'])).searchParams.get('tfs'), 'base64url').toString('latin1');
    assert.match(decoded, /ROM.*CA.*ZH/s);
    assert.equal(decoded.match(/2\x02CA/g).length, 2);
    assert.deepEqual(parseCard('下午2:50\n–\n下午6:30+1\n中國南方航空\n33 小時 40 分鐘\n$65,230\n來回票價'), { time: '下午2:50 – 下午6:30+1', airline: '中國南方航空', duration: '33 小時 40 分鐘', minutes: 2020, price: 65230 });
    assert.deepEqual(parseCard('下午2:50\nTPE\n清晨7:20+1\nCDG\n18 小時 30 分鐘\n中國國際航空\n$42,100\n來回票價'), { time: '下午2:50 – 清晨7:20+1', airline: '中國國際航空', duration: '18 小時 30 分鐘', minutes: 1110, price: 42100 });
    console.log('ok');
  } else {
    await main();
  }
}
