#!/usr/bin/env node
/**
 * Standalone data fetcher for Deribit options data
 * Can be run via cron to cache JSON for GFW-blocked environments
 */

const fs = require('fs');
const path = require('path');
const { curlFetch } = require('../lib/curl-fetch');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DERIBIT_API = 'www.deribit.com';

function fetchJSON(endpoint, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `https://${DERIBIT_API}/api/v2/public/${endpoint}${qs ? '?' + qs : ''}`;
  return curlFetch(url).then(text => {
    const json = JSON.parse(text);
    if (json.error) throw new Error(json.error.message);
    return json.result;
  });
}

function parseInstrument(name) {
  const parts = name.split('-');
  if (parts.length !== 4) return null;
  const [coin, dateStr, strikeStr, type] = parts;
  const months = { JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11 };
  // Date format: 4JUN26 or 25DEC26 (day may be 1-2 digits)
  const match = dateStr.match(/^(\d{1,2})([A-Z]{3})(\d{2})$/i);
  if (!match) return null;
  const [, day, monthStr, year] = match;
  const expiry = new Date(Date.UTC(+('20' + year), months[monthStr.toUpperCase()], +day, 8, 0, 0));
  return { coin, dateStr, strike: parseFloat(strikeStr), type: type === 'C' ? 'call' : 'put', expiry: expiry.toISOString() };
}

async function fetchForCurrency(currency) {
  const [bookSummary, instruments, indexPrice] = await Promise.all([
    fetchJSON('get_book_summary_by_currency', { currency, kind: 'option' }),
    fetchJSON('get_instruments', { currency, kind: 'option', expired: 'false' }),
    fetchJSON('get_index_price', { index_name: `${currency.toLowerCase()}_usd` }),
  ]);

  const instMap = new Map();
  for (const inst of instruments || []) instMap.set(inst.instrument_name, inst);

  const spotPrice = indexPrice?.index_price || 0;
  const options = [];

  for (const item of bookSummary || []) {
    const parsed = parseInstrument(item.instrument_name);
    if (!parsed) continue;

    const inst = instMap.get(item.instrument_name);
    const contractSize = inst?.contract_size || (currency === 'BTC' ? 0.1 : 1);
    const oiContracts = item.open_interest || 0;
    const oiCoin = oiContracts * contractSize;

    options.push({
      ...parsed,
      markPrice: item.mark_price || 0,
      volume: item.volume_usd || item.volume || 0,
      openInterest: oiContracts,
      openInterestCoin: oiCoin,
      openInterestUsd: oiCoin * spotPrice,
      iv: item.iv || 0,
      underlyingPrice: item.underlying_price || spotPrice,
    });
  }

  return { currency, spotPrice, fetchedAt: new Date().toISOString(), options };
}

async function main() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  try {
    const [btc, eth] = await Promise.all([
      fetchForCurrency('BTC'),
      fetchForCurrency('ETH'),
    ]);

    const payload = { btc, eth, fetchedAt: new Date().toISOString() };
    const outPath = path.join(DATA_DIR, 'options-data.json');
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));

    console.log(`✓ Saved to ${outPath}`);
    console.log(`  BTC: ${btc.options.length} options, spot=$${btc.spotPrice.toLocaleString()}`);
    console.log(`  ETH: ${eth.options.length} options, spot=$${eth.spotPrice.toLocaleString()}`);
  } catch (err) {
    console.error('Fetch failed:', err.message);
    process.exit(1);
  }
}

main();
