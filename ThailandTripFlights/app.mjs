import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { urlFor } from './scan.mjs';

const PORT = Number(process.env.PORT || 43173);
let scan;
let scanning = false;
let failed = false;
let log = '';
let total = 0;

function parseCsv(text) {
  const lines = text.trim().split('\n');
  const headers = lines.shift()?.split(',') || [];
  return lines.map(line => {
    const values = [...line.matchAll(/"((?:""|[^"])*)"(?:,|$)/g)].map(x => x[1].replaceAll('""', '"'));
    return Object.fromEntries(headers.map((header, i) => [header, values[i] ?? '']));
  });
}

async function data() {
  const [results, noFlights] = await Promise.all([
    readFile('results.csv', 'utf8').catch(() => ''),
    readFile('no-flights.csv', 'utf8').catch(() => ''),
  ]);
  const unavailable = parseCsv(noFlights).map(x => ({ ...x, status: 'no flights' }));
  const latest = new Map([...parseCsv(results).filter(x => !x.status.startsWith('error:')), ...unavailable].filter(x => x.days).sort((a, b) => a.checked_at.localeCompare(b.checked_at)).map(x => [`${x.airline},${x.origin},${x.destination},${x.departure},${x.return},${x.days}`, x]));
  return {
    generatedAt: new Date().toISOString(),
    results: [...latest.values()].filter(x => x.status === 'ok').map(x => ({ ...x, days: Number(x.days), total_minutes: Number(x.total_minutes), total_twd: Number(x.total_twd), url: urlFor(x.departure, x.return, x.origin, x.destination, x.airline) })),
    noFlights: unavailable,
  };
}

async function exportData() {
  const { generatedAt, results } = await data();
  await mkdir('public/data', { recursive: true });
  await writeFile('public/data/results.json', `${JSON.stringify({ generatedAt, results })}\n`);
}

function json(response, value, status = 200) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function runScans({ from, to, days, destination, airlines }) {
  scanning = true;
  failed = false;
  log = '';
  total = ((new Date(to) - new Date(from)) / 86400000 + 1) * days.length;
  const airlineFilter = airlines.sort().join('+');
  await new Promise(resolve => {
    scan = spawn(process.execPath, ['scan.mjs', from, to, days.join(','), destination, airlineFilter]);
    scan.stdout.on('data', chunk => log += chunk);
    scan.stderr.on('data', chunk => log += chunk);
    scan.on('error', error => { failed = true; log += `${error.message}\n`; });
    scan.on('close', code => { if (code) failed = true; log += `${code ? '失敗' : '完成'} ${airlineFilter} (${code})\n`; resolve(); });
  });
  scan = undefined;
  scanning = false;
  if (!failed) await exportData();
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (request.method === 'GET' && url.pathname === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return response.end(await readFile('public/index.html'));
  }
  if (request.method === 'GET' && url.pathname === '/shared/flight-ui.css') { response.writeHead(200, { 'content-type': 'text/css; charset=utf-8' }); return response.end(await readFile('../public/shared/flight-ui.css')); }
  if (request.method === 'GET' && url.pathname === '/shared/flight-ui.js') { response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' }); return response.end(await readFile('../public/shared/flight-ui.js')); }
  if (request.method === 'GET' && url.pathname === '/data/results.json') return json(response, await data());
  if (request.method === 'GET' && url.pathname === '/api/results') return json(response, await data());
  if (request.method === 'GET' && url.pathname === '/api/status') return json(response, { running: scanning, failed, log: log.slice(-4000), progress: scanning ? Math.min(99, Math.round((log.match(/^查詢 /gm)?.length || 0) / total * 100)) : 100 });
  if (request.method === 'POST' && url.pathname === '/api/scan') {
    if (scanning) return json(response, { error: '搜尋正在執行中' }, 409);
    let body = '';
    for await (const chunk of request) body += chunk;
    let input;
    try { input = JSON.parse(body || '{}'); }
    catch { return json(response, { error: 'JSON 格式錯誤' }, 400); }
    const { from, to, days, destination, airlines } = input;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to || !Array.isArray(days) || !days.length || days.some(x => !Number.isInteger(x) || x < 1 || x > 30) || !/^[A-Z]{3}$/.test(destination) || !Array.isArray(airlines) || !airlines.length || airlines.some(x => x !== 'ALL')) {
      return json(response, { error: '搜尋條件無效' }, 400);
    }
    runScans({ from, to, days, destination, airlines });
    return json(response, { started: true, airlines });
  }
  response.writeHead(404).end('Not found');
});

if (process.argv[2] === '--self-test') {
  assert.deepEqual(parseCsv('a,b\n"x","1"\n'), [{ a: 'x', b: '1' }]);
  console.log('ok');
} else if (process.argv[2] === '--export') {
  await exportData();
  console.log('public/data/results.json updated');
} else {
  server.listen(PORT, '127.0.0.1', () => console.log(`http://127.0.0.1:${PORT}`));
}
