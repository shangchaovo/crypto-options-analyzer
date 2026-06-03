/**
 * Options Analyzer - Main Application Controller
 * Orchestrates data fetching, analytics, and UI rendering
 */

const App = (() => {
  // State
  let state = {
    coin: 'BTC',
    selectedExpiry: null,
    btcData: null,
    ethData: null,
    btcPrice: { price: 0, change24h: 0 },
    ethPrice: { price: 0, change24h: 0 },
    btcSkew: null,
    ethSkew: null,
    loading: true,
    autoRefreshInterval: null,
  };

  // DOM refs
  const $ = (id) => document.getElementById(id);

  function init() {
    Chart.init('oi-chart');

    // Event listeners
    $('refresh-btn').addEventListener('click', () => loadData(true));

    document.querySelectorAll('.coin-btn').forEach(btn => {
      btn.addEventListener('click', () => switchCoin(btn.dataset.coin));
    });

    // Initial load
    loadData();

    // Auto refresh every 5 minutes
    state.autoRefreshInterval = setInterval(() => loadData(), 5 * 60 * 1000);
  }

  async function loadData(force = false) {
    if (state.loading && !force) return;
    setLoading(true);

    try {
      // Try API first, fallback to local JSON
      let btcRaw, ethRaw, btcPrice, ethPrice, btcSkew, ethSkew;

      try {
        [btcRaw, ethRaw, btcPrice, ethPrice, btcSkew, ethSkew] = await Promise.all([
          API.fetchOptionData('BTC'),
          API.fetchOptionData('ETH'),
          API.fetchPriceData('BTC'),
          API.fetchPriceData('ETH'),
          API.fetchSkewData('BTC'),
          API.fetchSkewData('ETH'),
        ]);
      } catch (apiErr) {
        console.warn('API failed, trying local JSON:', apiErr.message);
        const cached = await API.fetchFromJson();
        if (cached) {
          btcRaw = { spotPrice: cached.btc.spotPrice, options: cached.btc.options.map(o => API.normalizeCachedOption(o)) };
          ethRaw = { spotPrice: cached.eth.spotPrice, options: cached.eth.options.map(o => API.normalizeCachedOption(o)) };
          btcPrice = { price: cached.btc.spotPrice, change24h: 0 };
          ethPrice = { price: cached.eth.spotPrice, change24h: 0 };
          btcSkew = null;
          ethSkew = null;
        } else {
          throw apiErr;
        }
      }

      if (btcRaw) state.btcData = processOptionData(btcRaw);
      if (ethRaw) state.ethData = processOptionData(ethRaw);
      state.btcPrice = btcPrice || { price: 0, change24h: 0 };
      state.ethPrice = ethPrice || { price: 0, change24h: 0 };
      state.btcSkew = btcSkew;
      state.ethSkew = ethSkew;

      // Set default expiry if not selected
      const currentData = state.coin === 'BTC' ? state.btcData : state.ethData;
      if (currentData && (!state.selectedExpiry || !currentData.expiryGroups.find(g => g.dateStr === state.selectedExpiry))) {
        state.selectedExpiry = currentData.expiryGroups[0]?.dateStr || null;
      }

      render();
      $('last-update-time').textContent = new Date().toLocaleString('zh-CN', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    } catch (err) {
      console.error('Load data error:', err);
      showError('数据加载失败，请检查网络连接或稍后重试');
    } finally {
      setLoading(false);
    }
  }

  function processOptionData(raw) {
    const { spotPrice, options } = raw;
    const expiryGroups = Analytics.groupByExpiry(options);

    // Calculate analytics for each expiry
    const expiryAnalytics = {};
    for (const group of expiryGroups) {
      const maxPain = Analytics.calculateMaxPain(group.options, spotPrice);
      const pcr = Analytics.calculatePCR(group.options);
      const concentrations = Analytics.findConcentrations(group.options, 10);
      const distribution = Analytics.buildStrikeDistribution(group.options);

      expiryAnalytics[group.dateStr] = {
        maxPain,
        pcr,
        concentrations,
        distribution,
        totalOiUsd: maxPain?.totalOiUsd || 0,
        totalOiCoin: maxPain?.totalOiCoin || 0,
      };
    }

    // Overall PCR
    const overallPCR = Analytics.calculatePCR(options);

    return {
      spotPrice,
      options,
      expiryGroups,
      expiryAnalytics,
      overallPCR,
    };
  }

  function switchCoin(coin) {
    state.coin = coin;

    document.querySelectorAll('.coin-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.coin === coin);
    });

    const currentData = coin === 'BTC' ? state.btcData : state.ethData;
    if (currentData) {
      state.selectedExpiry = currentData.expiryGroups[0]?.dateStr || null;
    }

    render();
  }

  function selectExpiry(dateStr) {
    state.selectedExpiry = dateStr;
    render();
  }

  function render() {
    const data = state.coin === 'BTC' ? state.btcData : state.ethData;
    const price = state.coin === 'BTC' ? state.btcPrice : state.ethPrice;
    const skew = state.coin === 'BTC' ? state.btcSkew : state.ethSkew;

    if (!data) return;

    renderPriceSummary();
    renderExpiryTabs(data);

    if (state.selectedExpiry) {
      const analytics = data.expiryAnalytics[state.selectedExpiry];
      if (analytics) {
        renderMaxPain(analytics, data.spotPrice);
        renderChart(analytics, data.spotPrice);
        renderConcentrations(analytics.concentrations);
      }
    }

    renderCalendar(data);
    renderSkew(skew);
  }

  function renderPriceCard(prefix, price, change24h) {
    $(`${prefix}-price`).textContent = price > 0 ? Analytics.formatPrice(price, prefix.toUpperCase()) : '--';
    $(`${prefix}-change`).textContent = change24h !== 0 ? Analytics.formatPct(change24h) : '--';
    $(`${prefix}-change`).className = 'price-change ' + (change24h >= 0 ? 'up' : 'down');
  }

  function renderPcr(pcr, valueId, hintId) {
    $(valueId).textContent = pcr.toFixed(2);
    const hint = pcr > 1 ? '看跌偏向' : pcr < 0.7 ? '看涨偏向' : '中性';
    $(hintId).textContent = hint;
    $(hintId).style.color = pcr > 1 ? 'var(--accent-put)' : pcr < 0.7 ? 'var(--accent-call)' : 'var(--text-muted)';
  }

  function renderPriceSummary() {
    renderPriceCard('btc', state.btcPrice.price, state.btcPrice.change24h);
    renderPriceCard('eth', state.ethPrice.price, state.ethPrice.change24h);

    if (state.btcData) renderPcr(state.btcData.overallPCR.pcr, 'btc-pcr', 'btc-pcr-hint');
    if (state.ethData) renderPcr(state.ethData.overallPCR.pcr, 'eth-pcr', 'eth-pcr-hint');
  }

  function renderExpiryTabs(data) {
    const container = $('expiry-tabs');
    container.innerHTML = '';

    for (const group of data.expiryGroups) {
      const analytics = data.expiryAnalytics[group.dateStr];
      const days = Analytics.daysUntil(group.date);
      const isActive = group.dateStr === state.selectedExpiry;

      const btn = document.createElement('button');
      btn.className = 'expiry-tab' + (isActive ? ' active' : '');
      btn.innerHTML = `
        <span>${formatExpiryLabel(group.date, days)}</span>
        <span class="tab-oi">${Analytics.formatUsd(analytics?.totalOiUsd || 0)}</span>
      `;
      btn.addEventListener('click', () => selectExpiry(group.dateStr));
      container.appendChild(btn);
    }
  }

  function formatExpiryLabel(date, days) {
    const m = date.getUTCMonth() + 1;
    const d = date.getUTCDate();
    if (days <= 0) return `今日 ${m}/${d}`;
    if (days === 1) return `明日 ${m}/${d}`;
    if (days <= 7) return `${days}天后 ${m}/${d}`;
    return `${m}月${d}日`;
  }

  function renderMaxPain(analytics, spotPrice) {
    const mp = analytics.maxPain;
    if (!mp) return;

    $('maxpain-strike').textContent = Analytics.formatPrice(mp.maxPainStrike, state.coin);
    $('spot-price').textContent = Analytics.formatPrice(spotPrice, state.coin);

    const devEl = $('maxpain-deviation');
    devEl.textContent = Analytics.formatPct(mp.deviation);
    devEl.style.color = mp.deviation >= 0 ? 'var(--green)' : 'var(--red)';

    $('total-oi').textContent = Analytics.formatUsd(mp.totalOiUsd);
  }

  function renderChart(analytics, spotPrice) {
    Chart.render({
      distribution: analytics.distribution,
      maxPainStrike: analytics.maxPain?.maxPainStrike,
      spotPrice,
      coin: state.coin,
    });
  }

  function renderConcentrations(concentrations) {
    const container = $('concentration-list');
    container.innerHTML = '';

    const maxOi = concentrations[0]?.totalOiCoin || 1;

    for (const item of concentrations.slice(0, 8)) {
      const div = document.createElement('div');
      div.className = 'concentration-item';
      div.innerHTML = `
        <div>
          <span class="conc-strike">$${item.strike.toLocaleString()}</span>
          <span class="conc-type ${item.type}">${item.type === 'call' ? 'CALL' : 'PUT'}</span>
        </div>
        <div class="conc-oi">
          <div class="conc-oi-value">${Analytics.formatNumber(item.totalOiCoin, 1)}</div>
          <div class="conc-bar-bg">
            <div class="conc-bar-fill ${item.type}" style="width:${(item.totalOiCoin / maxOi) * 100}%"></div>
          </div>
          <div class="conc-oi-pct">${item.pctOfTotal.toFixed(1)}%</div>
        </div>
      `;
      container.appendChild(div);
    }
  }

  function renderCalendar(data) {
    const container = $('calendar-list');
    container.innerHTML = '';

    const maxOi = Math.max(...data.expiryGroups.map(g => data.expiryAnalytics[g.dateStr]?.totalOiUsd || 0));

    for (const group of data.expiryGroups) {
      const analytics = data.expiryAnalytics[group.dateStr];
      const days = Analytics.daysUntil(group.date);
      const isActive = group.dateStr === state.selectedExpiry;
      const pcr = analytics?.pcr;

      const div = document.createElement('div');
      div.className = 'calendar-item' + (isActive ? ' active' : '');
      div.innerHTML = `
        <div>
          <div class="calendar-date">${formatExpiryLabel(group.date, days)}</div>
          <div class="calendar-days">PCR: ${pcr?.pcr?.toFixed(2) || '--'} | ${pcr?.callOi > pcr?.putOi ? 'Call偏' : pcr?.putOi > pcr?.callOi ? 'Put偏' : '平衡'}</div>
        </div>
        <div class="calendar-oi">
          <div class="calendar-oi-value">${Analytics.formatUsd(analytics?.totalOiUsd || 0)}</div>
          <div class="calendar-bar-bg">
            <div class="calendar-bar-fill" style="width:${maxOi > 0 ? ((analytics?.totalOiUsd || 0) / maxOi) * 100 : 0}%"></div>
          </div>
          <div class="calendar-oi-label">总持仓</div>
        </div>
      `;
      div.addEventListener('click', () => selectExpiry(group.dateStr));
      container.appendChild(div);
    }
  }

  function renderSkew(skew) {
    if (!skew) {
      $('skew-value').textContent = '--';
      document.getElementById('skew-bar').style.setProperty('--skew-pos', '50%');
      return;
    }

    $('skew-value').textContent = skew.skew.toFixed(1) + '%';
    const pos = Math.max(0, Math.min(100, 50 + skew.skew * 2));
    document.getElementById('skew-bar').style.setProperty('--skew-pos', pos + '%');

    // Color based on skew direction
    const valEl = $('skew-value');
    if (skew.skew > 5) valEl.style.color = 'var(--accent-put)';
    else if (skew.skew < -5) valEl.style.color = 'var(--accent-call)';
    else valEl.style.color = 'var(--text-secondary)';
  }

  function setLoading(loading) {
    state.loading = loading;
    const overlay = $('loading-overlay');
    if (loading) {
      overlay.classList.remove('hidden');
      $('refresh-btn').classList.add('spinning');
    } else {
      overlay.classList.add('hidden');
      $('refresh-btn').classList.remove('spinning');
    }
  }

  function showError(msg) {
    // Simple console error for now; could add a toast
    console.error(msg);
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { loadData };
})();
