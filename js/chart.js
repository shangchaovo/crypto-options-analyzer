/**
 * Canvas-based OI distribution chart
 * Renders call/put open interest as stacked bars with max pain / spot markers
 */

const Chart = (() => {
  let canvas, ctx, tooltipEl;
  let chartData = null;
  let hoverIndex = -1;

  function init(canvasId) {
    canvas = document.getElementById(canvasId);
    if (!canvas) return;

    // Create tooltip element
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'chart-tooltip';
    canvas.parentElement.appendChild(tooltipEl);

    // Setup resize observer
    const resizeObserver = new ResizeObserver(() => {
      resize();
      if (chartData) render(chartData);
    });
    resizeObserver.observe(canvas.parentElement);

    // Mouse events
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseleave', onMouseLeave);

    resize();
  }

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
  }

  function onMouseMove(e) {
    if (!chartData) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const { layout } = chartData;
    const idx = Math.floor((x - layout.marginLeft) / layout.barWidth);

    if (idx >= 0 && idx < chartData.distribution.length) {
      hoverIndex = idx;
      showTooltip(e.clientX, e.clientY, chartData.distribution[idx]);
    } else {
      hoverIndex = -1;
      hideTooltip();
    }
    render(chartData);
  }

  function onMouseLeave() {
    hoverIndex = -1;
    hideTooltip();
    if (chartData) render(chartData);
  }

  function showTooltip(x, y, item) {
    const totalOi = item.callOi + item.putOi;
    tooltipEl.innerHTML = `
      <div style="font-weight:700;margin-bottom:6px;border-bottom:1px solid var(--border-color);padding-bottom:4px;">
        行权价 $${item.strike.toLocaleString()}
      </div>
      <div class="tooltip-row"><span class="tooltip-label">Call 持仓</span><span class="tooltip-value" style="color:var(--accent-call)">${Analytics.formatNumber(item.callOi, 1)}</span></div>
      <div class="tooltip-row"><span class="tooltip-label">Put 持仓</span><span class="tooltip-value" style="color:var(--accent-put)">${Analytics.formatNumber(item.putOi, 1)}</span></div>
      <div class="tooltip-row"><span class="tooltip-label">总持仓</span><span class="tooltip-value">${Analytics.formatNumber(totalOi, 1)}</span></div>
      <div class="tooltip-row"><span class="tooltip-label">Call/Put</span><span class="tooltip-value">${item.putOi > 0 ? (item.callOi / item.putOi).toFixed(2) : '∞'}</span></div>
    `;

    const rect = canvas.parentElement.getBoundingClientRect();
    let left = x - rect.left + 16;
    let top = y - rect.top - 10;

    // Keep within bounds
    if (left + 200 > rect.width) left = x - rect.left - 210;
    if (top + 120 > rect.height) top = rect.height - 130;
    if (top < 0) top = 10;

    tooltipEl.style.left = left + 'px';
    tooltipEl.style.top = top + 'px';
    tooltipEl.classList.add('visible');
  }

  function hideTooltip() {
    tooltipEl.classList.remove('visible');
  }

  function render(data) {
    chartData = data;
    if (!ctx || !data || !data.distribution.length) return;

    const { distribution, maxPainStrike, spotPrice, coin } = data;
    const cssWidth = canvas.width / (window.devicePixelRatio || 1);
    const cssHeight = canvas.height / (window.devicePixelRatio || 1);

    const margin = { top: 30, right: 20, bottom: 50, left: 60 };
    const w = cssWidth - margin.left - margin.right;
    const h = cssHeight - margin.top - margin.bottom;

    // Calculate scales
    const maxOi = Math.max(...distribution.map(d => Math.max(d.callOi, d.putOi)));
    const yMax = maxOi * 1.15;
    const strikes = distribution.map(d => d.strike);
    const minStrike = Math.min(...strikes);
    const maxStrike = Math.max(...strikes);
    const xRange = maxStrike - minStrike || 1;

    // Store layout for hit testing
    const barWidth = w / distribution.length;
    data.layout = { marginLeft: margin.left, barWidth };

    ctx.clearRect(0, 0, cssWidth, cssHeight);

    // Background
    ctx.fillStyle = '#161b22';
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    // Grid lines
    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([4, 4]);
    for (let i = 0; i <= 4; i++) {
      const y = margin.top + h * (i / 4);
      ctx.beginPath();
      ctx.moveTo(margin.left, y);
      ctx.lineTo(margin.left + w, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Y-axis labels
    ctx.fillStyle = '#8b949e';
    ctx.font = '11px -apple-system, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 4; i++) {
      const val = yMax * (1 - i / 4);
      const y = margin.top + h * (i / 4);
      ctx.fillText(Analytics.formatNumber(val, 0), margin.left - 8, y);
    }

    // Y-axis title
    ctx.save();
    ctx.translate(16, margin.top + h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#6e7681';
    ctx.font = '11px -apple-system, sans-serif';
    ctx.fillText('持仓量 (' + (coin === 'BTC' ? 'BTC' : 'ETH') + ')', 0, 0);
    ctx.restore();

    // Draw bars
    const barGap = Math.max(1, barWidth * 0.15);
    const barW = barWidth - barGap;

    distribution.forEach((d, i) => {
      const x = margin.left + i * barWidth + barGap / 2;

      // Call bar (green, up)
      const callH = (d.callOi / yMax) * h;
      const callY = margin.top + h - callH;

      // Put bar (red, overlapping or stacked - let's do side by side for clarity)
      const putH = (d.putOi / yMax) * h;
      const putY = margin.top + h - putH;

      // Half width each, side by side
      const halfW = barW / 2;

      // Call
      if (i === hoverIndex) {
        ctx.fillStyle = 'rgba(16, 185, 129, 0.9)';
        ctx.shadowColor = 'rgba(16, 185, 129, 0.3)';
        ctx.shadowBlur = 8;
      }
      ctx.fillRect(x, callY, halfW, callH);
      ctx.shadowBlur = 0;

      // Put
      ctx.fillStyle = 'rgba(239, 68, 68, 0.75)';
      if (i === hoverIndex) {
        ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
        ctx.shadowColor = 'rgba(239, 68, 68, 0.3)';
        ctx.shadowBlur = 8;
      }
      ctx.fillRect(x + halfW, putY, halfW, putH);
      ctx.shadowBlur = 0;
    });

    // X-axis labels (show every Nth label)
    const labelStep = Math.ceil(distribution.length / 12);
    ctx.fillStyle = '#8b949e';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    distribution.forEach((d, i) => {
      if (i % labelStep === 0 || i === distribution.length - 1) {
        const x = margin.left + i * barWidth + barWidth / 2;
        ctx.fillText(Analytics.formatNumber(d.strike, 0), x, margin.top + h + 6);
      }
    });

    ctx.fillStyle = '#6e7681';
    ctx.font = '11px -apple-system, sans-serif';
    ctx.fillText('行权价 ($)', margin.left + w / 2, cssHeight - 8);

    // Max Pain line
    if (maxPainStrike) {
      const painX = margin.left + ((maxPainStrike - minStrike) / xRange) * w + barWidth / 2;
      if (painX >= margin.left && painX <= margin.left + w) {
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(painX, margin.top);
        ctx.lineTo(painX, margin.top + h);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label
        ctx.fillStyle = '#f59e0b';
        ctx.font = 'bold 11px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Max Pain', painX, margin.top - 6);
      }
    }

    // Spot price line
    if (spotPrice) {
      const spotX = margin.left + ((spotPrice - minStrike) / xRange) * w + barWidth / 2;
      if (spotX >= margin.left && spotX <= margin.left + w) {
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(spotX, margin.top);
        ctx.lineTo(spotX, margin.top + h);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label
        ctx.fillStyle = '#3b82f6';
        ctx.font = 'bold 11px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Spot', spotX, margin.top + h + 20);
      }
    }

    // Hover highlight bar
    if (hoverIndex >= 0 && hoverIndex < distribution.length) {
      const x = margin.left + hoverIndex * barWidth;
      ctx.fillStyle = 'rgba(240, 185, 11, 0.08)';
      ctx.fillRect(x, margin.top, barWidth, h);
    }
  }

  return { init, render };
})();
