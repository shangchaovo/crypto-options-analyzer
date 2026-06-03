/**
 * Options analytics engine
 * - Max Pain calculation
 * - Open interest concentration
 * - Call/Put ratio
 * - Expiry grouping
 */

const Analytics = (() => {
  // Group options by expiry date
  function groupByExpiry(options) {
    const groups = {};
    for (const opt of options) {
      const key = opt.expiry.toISOString().split('T')[0];
      if (!groups[key]) {
        groups[key] = {
          date: opt.expiry,
          dateStr: opt.dateStr,
          options: [],
        };
      }
      groups[key].options.push(opt);
    }
    // Sort by date
    return Object.values(groups).sort((a, b) => a.date - b.date);
  }

  // Calculate Max Pain for a set of options (single expiry)
  function calculateMaxPain(options, spotPrice) {
    // Get unique strikes
    const strikes = [...new Set(options.map(o => o.strike))].sort((a, b) => a - b);
    if (strikes.length === 0) return null;

    let minPain = Infinity;
    let maxPainStrike = strikes[0];

    for (const testStrike of strikes) {
      let totalIntrinsicValue = 0;

      for (const opt of options) {
        let intrinsic = 0;
        if (opt.type === 'call') {
          intrinsic = Math.max(0, testStrike - opt.strike) * opt.openInterestCoin;
        } else {
          intrinsic = Math.max(0, opt.strike - testStrike) * opt.openInterestCoin;
        }
        totalIntrinsicValue += intrinsic;
      }

      if (totalIntrinsicValue < minPain) {
        minPain = totalIntrinsicValue;
        maxPainStrike = testStrike;
      }
    }

    // Calculate total OI for this expiry
    const totalOiUsd = options.reduce((sum, o) => sum + o.openInterestUsd, 0);
    const totalOiCoin = options.reduce((sum, o) => sum + o.openInterestCoin, 0);

    // Calculate deviation from spot
    const deviation = ((maxPainStrike - spotPrice) / spotPrice) * 100;

    return {
      maxPainStrike,
      totalIntrinsicValue: minPain,
      totalOiUsd,
      totalOiCoin,
      deviation,
      spotPrice,
    };
  }

  // Calculate Call/Put ratio by open interest
  function calculatePCR(options) {
    const callOi = options
      .filter(o => o.type === 'call')
      .reduce((sum, o) => sum + o.openInterestCoin, 0);
    const putOi = options
      .filter(o => o.type === 'put')
      .reduce((sum, o) => sum + o.openInterestCoin, 0);

    const pcr = callOi > 0 ? putOi / callOi : 0;
    return { pcr, callOi, putOi, totalOi: callOi + putOi };
  }

  // Find top concentration strikes (where big money is betting)
  function findConcentrations(options, topN = 10) {
    // Group by strike and type
    const strikeMap = {};
    for (const opt of options) {
      const key = `${opt.strike}-${opt.type}`;
      if (!strikeMap[key]) {
        strikeMap[key] = {
          strike: opt.strike,
          type: opt.type,
          totalOiCoin: 0,
          totalOiUsd: 0,
          count: 0,
        };
      }
      strikeMap[key].totalOiCoin += opt.openInterestCoin;
      strikeMap[key].totalOiUsd += opt.openInterestUsd;
      strikeMap[key].count += 1;
    }

    const all = Object.values(strikeMap);
    const totalOi = all.reduce((s, x) => s + x.totalOiCoin, 0);

    // Sort by OI descending
    all.sort((a, b) => b.totalOiCoin - a.totalOiCoin);

    return all.slice(0, topN).map(item => ({
      ...item,
      pctOfTotal: totalOi > 0 ? (item.totalOiCoin / totalOi) * 100 : 0,
    }));
  }

  // Build strike distribution for chart
  function buildStrikeDistribution(options) {
    const strikes = [...new Set(options.map(o => o.strike))].sort((a, b) => a - b);
    const distribution = [];

    for (const strike of strikes) {
      const calls = options.filter(o => o.strike === strike && o.type === 'call');
      const puts = options.filter(o => o.strike === strike && o.type === 'put');

      distribution.push({
        strike,
        callOi: calls.reduce((s, o) => s + o.openInterestCoin, 0),
        putOi: puts.reduce((s, o) => s + o.openInterestCoin, 0),
        callOiUsd: calls.reduce((s, o) => s + o.openInterestUsd, 0),
        putOiUsd: puts.reduce((s, o) => s + o.openInterestUsd, 0),
        callIv: calls.length > 0 ? calls.reduce((s, o) => s + o.iv, 0) / calls.length : 0,
        putIv: puts.length > 0 ? puts.reduce((s, o) => s + o.iv, 0) / puts.length : 0,
      });
    }

    return distribution;
  }

  // Format large numbers
  function formatNumber(n, digits = 0) {
    if (n >= 1e9) return (n / 1e9).toFixed(digits) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(digits) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(digits) + 'K';
    return n.toFixed(digits);
  }

  function formatUsd(n) {
    return '$' + formatNumber(n, 1);
  }

  function formatPrice(n, coin) {
    if (coin === 'BTC') return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
    return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }

  function formatPct(n) {
    const sign = n >= 0 ? '+' : '';
    return sign + n.toFixed(2) + '%';
  }

  function daysUntil(date) {
    const ms = date - Date.now();
    return Math.ceil(ms / (24 * 3600 * 1000));
  }

  return {
    groupByExpiry,
    calculateMaxPain,
    calculatePCR,
    findConcentrations,
    buildStrikeDistribution,
    formatNumber,
    formatUsd,
    formatPrice,
    formatPct,
    daysUntil,
  };
})();
