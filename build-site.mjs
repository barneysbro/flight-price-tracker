import { cp, mkdir, rm } from 'node:fs/promises';

await rm('site', { recursive: true, force: true });
await mkdir('site');
await cp('public', 'site', { recursive: true });
for (const [source, destination] of [
  ['EuropeFlights/public', 'europe'],
  ['JapanFlights/public', 'japan'],
  ['ThailandFlights/public', 'bangkok'],
  ['ThailandTripFlights/public', 'bangkok-trip'],
]) await cp(source, `site/${destination}`, { recursive: true });
console.log('site built');
