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
const OUTPUT_PATH = path.join(DATA_DIR, 'options-data.json');
const LOCK_PATH = path.join(DATA_DIR, '.options-update.lock');
const STALE_LOCK_MS = 10 * 60 * 1000;

function fetchJSON(endpoint, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `https://${DERIBIT_API}/api/v2/public/${endpoint}${qs ? '?' + qs : ''}`;
  return curlFetch(url).then(text => {
    const json = JSON.parse(text);
    if (json.error) throw new Error(json.error.message);
    return json.result;
  });
}

function acquireLock() {
  if (fs.existsSync(LOCK_PATH)) {
    const ageMs = Date.now() - fs.statSync(LOCK_PATH).mtimeMs;
    if (ageMs > STALE_LOCK_MS) fs.unlinkSync(LOCK_PATH);
  }

  const fd = fs.openSync(LOCK_PATH, 'wx');
  fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  return fd;
}

function releaseLock(fd) {
  if (fd === null) return;
  fs.closeSync(fd);
  if (fs.existsSync(LOCK_PATH)) fs.unlinkSync(LOCK_PATH);
}

function validateCurrencyData(data) {
  if (!Number.isFinite(data.spotPrice) || data.spotPrice <= 0) {
    throw new Error(`${data.currency}: invalid spot price`);
  }
  if (!Array.isArray(data.options) || data.options.length === 0) {
    throw new Error(`${data.currency}: no options returned`);
  }
  if (data.options.some(option => !option.expiry || !Number.isFinite(option.strike))) {
    throw new Error(`${data.currency}: invalid option record`);
  }
}

function writeJsonAtomic(filePath, payload) {
  const tempPath = `${filePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2));
    JSON.parse(fs.readFileSync(tempPath, 'utf8'));
    fs.renameSync(tempPath, filePath);
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
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
  const strike = parseFloat(strikeStr);
  if (!Number.isFinite(strike) || Number.isNaN(expiry.getTime()) || (type !== 'C' && type !== 'P')) return null;
  return { coin, dateStr, strike, type: type === 'C' ? 'call' : 'put', expiry: expiry.toISOString() };
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
  let lockFd = null;

  try {
    lockFd = acquireLock();
    const [btc, eth] = await Promise.all([
      fetchForCurrency('BTC'),
      fetchForCurrency('ETH'),
    ]);

    validateCurrencyData(btc);
    validateCurrencyData(eth);

    const fetchedAt = new Date().toISOString();
    const payload = { schemaVersion: 1, source: 'Deribit', btc, eth, fetchedAt };
    writeJsonAtomic(OUTPUT_PATH, payload);

    console.log(JSON.stringify({
      ok: true,
      fetchedAt,
      output: OUTPUT_PATH,
      btc: { options: btc.options.length, spotPrice: btc.spotPrice },
      eth: { options: eth.options.length, spotPrice: eth.spotPrice },
    }));
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: err.message }));
    process.exitCode = 1;
  } finally {
    releaseLock(lockFd);
  }
}

main();
