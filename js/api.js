/**
 * Deribit API wrapper for options data fetching
 * Supports: direct API (via proxy on localhost), local JSON fallback
 */

const API = (() => {
  const BASE_URL = (() => {
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      return '/api/deribit';
    }
    return 'https://www.deribit.com/api/v2/public';
  })();

  const TIMEOUT = 20000;

  async function fetchJSON(endpoint, params = {}) {
    const qs = new URLSearchParams(params).toString();
    const url = `${BASE_URL}/${endpoint}${qs ? '?' + qs : ''}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || 'API error');
    return data.result;
  }

  // Load from pre-generated JSON cache
  async function fetchFromJson() {
    try {
      const res = await fetch('./data/options-data.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('No local cache');
      const payload = await res.json();
      // Validate
      if (!payload.btc || !payload.eth) throw new Error('Invalid cache');
      return payload;
    } catch {
      return null;
    }
  }

  function parseInstrument(name) {
    const parts = name.split('-');
    if (parts.length !== 4) return null;
    const [coin, dateStr, strikeStr, type] = parts;
    const strike = parseFloat(strikeStr);
    const expiry = parseDeribitDate(dateStr);
    return { coin, dateStr, strike, type: type === 'C' ? 'call' : 'put', expiry, name };
  }

  function parseDeribitDate(dateStr) {
    const months = { JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11 };
    const match = dateStr.match(/^(\d{1,2})([A-Z]{3})(\d{2})$/i);
    if (!match) return new Date(NaN);
    const [, day, monthStr, year] = match;
    return new Date(Date.UTC(+('20' + year), months[monthStr.toUpperCase()], +day, 8, 0, 0));
  }

  // Convert raw API option item to normalized format
  function normalizeOption(item, spotPrice, contractSize) {
    const parsed = parseInstrument(item.instrument_name);
    if (!parsed) return null;
    const oiContracts = item.open_interest || 0;
    const oiCoin = oiContracts * contractSize;
    return {
      ...parsed,
      markPrice: item.mark_price || 0,
      bidPrice: item.bid_price || 0,
      askPrice: item.ask_price || 0,
      volume: item.volume || 0,
      openInterest: oiContracts,
      openInterestCoin: oiCoin,
      openInterestUsd: oiCoin * spotPrice,
      iv: item.iv || 0,
      underlyingPrice: item.underlying_price || spotPrice,
      estimatedDeliveryPrice: item.estimated_delivery_price || spotPrice,
    };
  }

  // Convert cached JSON option to normalized format (already normalized in cache)
  function normalizeCachedOption(opt) {
    return {
      ...opt,
      expiry: new Date(opt.expiry),
    };
  }

  function calculateSkewFromBook(spot, bookSummary) {
    if (!spot) return null;

    const lowerStrike = spot * 0.88;
    const upperStrike = spot * 1.12;
    const now = Date.now();
    let bestPut = null, bestCall = null;

    for (const item of bookSummary || []) {
      const parsed = parseInstrument(item.instrument_name);
      if (!parsed) continue;
      const daysToExpiry = (parsed.expiry - now) / (24 * 3600 * 1000);
      if (daysToExpiry < 0 || daysToExpiry > 45) continue;

      if (parsed.type === 'put') {
        const distance = Math.abs(parsed.strike - lowerStrike);
        if (!bestPut || distance < bestPut.distance) {
          bestPut = { strike: parsed.strike, iv: item.iv || 0, distance };
        }
      } else {
        const distance = Math.abs(parsed.strike - upperStrike);
        if (!bestCall || distance < bestCall.distance) {
          bestCall = { strike: parsed.strike, iv: item.iv || 0, distance };
        }
      }
    }

    if (!bestPut?.iv || !bestCall?.iv) return null;
    const avgIv = (bestPut.iv + bestCall.iv) / 2;
    if (!avgIv) return null;

    return {
      skew: ((bestPut.iv - bestCall.iv) / avgIv) * 100,
      putIv: bestPut.iv,
      callIv: bestCall.iv,
      putStrike: bestPut.strike,
      callStrike: bestCall.strike,
    };
  }

  async function fetchMarketData(currency) {
    const [bookSummary, spot, instruments] = await Promise.all([
      fetchJSON('get_book_summary_by_currency', { currency, kind: 'option' }),
      fetchJSON('get_index_price', { index_name: `${currency.toLowerCase()}_usd` }),
      fetchJSON('get_instruments', { currency, kind: 'option', expired: 'false' }),
    ]);
    const spotPrice = spot?.index_price || 0;

    const instrumentMap = new Map();
    for (const inst of instruments || []) instrumentMap.set(inst.instrument_name, inst);

    const options = [];
    for (const item of bookSummary || []) {
      const inst = instrumentMap.get(item.instrument_name);
      const contractSize = inst?.contract_size || (currency === 'BTC' ? 0.1 : 1);
      const opt = normalizeOption(item, spotPrice, contractSize);
      if (opt) options.push(opt);
    }
    return {
      spotPrice,
      options,
      price: { price: spotPrice, change24h: 0 },
      skew: calculateSkewFromBook(spotPrice, bookSummary),
    };
  }

  async function fetchOptionData(currency) {
    const market = await fetchMarketData(currency);
    return { spotPrice: market.spotPrice, options: market.options };
  }

  async function fetchSkewData(currency) {
    try {
      const perp = await fetchJSON('get_index_price', { index_name: `${currency.toLowerCase()}_usd` });
      const spot = perp?.index_price || 0;
      if (!spot) return null;

      const result = await fetchJSON('get_book_summary_by_currency', { currency, kind: 'option' });
      return calculateSkewFromBook(spot, result);
    } catch {
      return null;
    }
  }

  async function fetchPriceData(currency) {
    try {
      const result = await fetchJSON('get_index_price', { index_name: `${currency.toLowerCase()}_usd` });
      return { price: result?.index_price || 0, change24h: 0 };
    } catch {
      return { price: 0, change24h: 0 };
    }
  }

  return {
    fetchMarketData,
    fetchOptionData,
    fetchSkewData,
    fetchPriceData,
    fetchFromJson,
    parseInstrument,
    parseDeribitDate,
    normalizeCachedOption,
  };
})();
