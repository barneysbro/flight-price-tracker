(() => {
  const carrierCodes = {
    '中華航空': 'CI', '中國南方航空': 'CZ', '中國國際航空': 'CA', '中國東方航空': 'MU',
    '海南航空': 'HU', '廈門航空': 'MF', '四川航空': '3U', '吉祥航空': 'HO', '深圳航空': 'ZH',
    '星宇航空': 'JX', 'STARLUX': 'JX', '長榮航空': 'BR', 'EVA': 'BR', '泰國獅航': 'SL', 'Thai Lion': 'SL',
    '泰國亞航': 'FD', 'Thai AirAsia': 'FD', '泰越捷航空': 'VZ', 'Thai Vietjet': 'VZ', '泰國國際航空': 'TG', 'THAI': 'TG',
    '酷航': 'TR', '捷星日本航空': 'GK', '台灣虎航': 'IT', '樂桃航空': 'MM',
  };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const money = value => new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(value);
  const time24 = value => String(value ?? '').replace(/(凌晨|清晨|上午|中午|下午|傍晚|晚上|午夜)(\d{1,2}):(\d{2})/g, (_, period, h, m) => {
    let hour = Number(h);
    if (['中午', '下午', '傍晚', '晚上'].includes(period) && hour < 12) hour += 12;
    if (['凌晨', '清晨', '上午', '午夜'].includes(period) && hour === 12) hour = 0;
    return `${String(hour).padStart(2, '0')}:${m}`;
  });
  const shortDate = value => `${value.slice(5).replace('-', '/')}（${new Intl.DateTimeFormat('zh-TW', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))}）`;
  const duration = minutes => minutes ? `${Math.floor(minutes / 60)} 小時${minutes % 60 ? ` ${minutes % 60} 分鐘` : ''}` : '—';
  const logos = name => {
    const codes = [...new Set(Object.entries(carrierCodes).filter(([carrier]) => name?.includes(carrier)).map(([, code]) => code))];
    return `<span class="flight-ticket-logos">${codes.map(code => `<img src="https://www.gstatic.com/flights/airline_logos/70px/${code}.png" alt="" onerror="this.style.display='none'">`).join('')}</span>`;
  };

  function mountNavigation() {
    const pages = [
      { id: 'europe', label: '歐洲', port: 43170 },
      { id: 'japan', label: '日本', port: 43172 },
      { id: 'bangkok', label: '曼谷 · Google', port: 43171 },
      { id: 'bangkok-trip', label: '曼谷 · Trip.com', port: 43173 },
    ];
    const local = ['127.0.0.1', 'localhost'].includes(location.hostname) && pages.some(page => String(page.port) === location.port);
    const current = local ? pages.find(page => String(page.port) === location.port)?.id : pages.find(page => location.pathname.split('/').includes(page.id))?.id;
    const nav = document.createElement('nav');
    nav.className = 'flight-site-nav';
    nav.setAttribute('aria-label', '切換航班頁面');
    nav.innerHTML = `<div class="flight-site-nav-inner"><span class="flight-site-nav-label">切換航線</span>${pages.map(page => `<a class="flight-site-nav-link${page.id === current ? ' active' : ''}" href="${local ? `http://${location.hostname}:${page.port}/` : `../${page.id}/`}">${page.label}</a>`).join('')}</div>`;
    const header = document.querySelector('.appbar, header');
    header?.classList.add('flight-shared-header');
    header?.after(nav);
    if (local) {
      const panel = document.querySelector('#searchPanel') || document.querySelector('#scan');
      panel?.classList.add('flight-local-card');
      if (panel && !panel.querySelector('.local-mode-header,.flight-local-heading')) panel.insertAdjacentHTML('afterbegin','<div class="flight-local-heading"><span>LOCAL</span><div><strong>本機搜尋工具</strong><small>此區塊不會顯示於 GitHub Pages</small></div></div>');
    }
  }

  function renderTickets(container, results, options = {}) {
    container.classList.add('flight-ticket-list');
    const provider = options.provider || 'Google Flights';
    const tickets = [...results].sort((a, b) => a.total_twd - b.total_twd).slice(0, 3);
    container.innerHTML = tickets.map((flight, index) => {
      const carrier = flight.carrier || options.carrierName?.(flight) || '航空公司待確認';
      const destination = options.destinationName?.(flight.destination) || flight.destination;
      return `<article class="flight-ticket">
        <div class="flight-ticket-main">
          <div class="flight-ticket-header"><span class="flight-ticket-rank">NO.${index + 1}</span><span class="flight-ticket-title">FLIGHT TICKET</span><span class="flight-ticket-airline">${logos(carrier)} ${esc(carrier)}</span></div>
          <div class="flight-ticket-route"><div><div class="flight-ticket-code">${esc(flight.origin)}</div><div class="flight-ticket-city">${esc(options.originName || '台北')}</div></div><div class="flight-ticket-line"><span>✈</span></div><div><div class="flight-ticket-code">${esc(flight.destination)}</div><div class="flight-ticket-city">${esc(destination)}</div></div></div>
          <div class="flight-ticket-details"><div><div class="flight-ticket-label">旅行日期</div><div class="flight-ticket-value">${shortDate(flight.departure)}–${shortDate(flight.return)}<br>${flight.days} 天</div></div><div><div class="flight-ticket-label">去程</div><div class="flight-ticket-value">${esc(time24(flight.outbound_time))}<br>${esc(flight.outbound_duration || '—')}</div></div><div><div class="flight-ticket-label">回程</div><div class="flight-ticket-value">${esc(time24(flight.return_time))}<br>${esc(flight.return_duration || '—')}</div></div></div>
        </div>
        <div class="flight-ticket-stub"><div class="flight-ticket-label">2 位成人來回總價</div><div class="flight-ticket-price">${money(flight.total_twd)}</div><div class="flight-ticket-note">平均每人 ${money(flight.total_twd / 2)}<br>合計飛行 ${duration(flight.total_minutes)}${options.note ? `<br>${esc(options.note)}` : ''}</div><a class="flight-ticket-link" href="${esc(flight.url)}" target="_blank" rel="noopener noreferrer">查看 ${esc(provider)}</a><div class="flight-ticket-barcode" aria-hidden="true"></div></div>
      </article>`;
    }).join('') || `<p class="flight-ticket-empty">${esc(options.emptyText || '沒有符合條件的結果')}</p>`;
  }

  function renderResultTable(tbody, results, options = {}) {
    const provider = options.provider || 'Google Flights';
    tbody.innerHTML = results.map(flight => {
      const carrier = flight.carrier || options.carrierName?.(flight) || '航空公司待確認';
      return `<tr><td><span class="flight-result-carrier" title="${esc(carrier)}">${logos(carrier)}<span>${esc(carrier)}</span></span></td><td>${esc(flight.origin)} → ${esc(flight.destination)}</td><td>${shortDate(flight.departure)}–${shortDate(flight.return)}</td><td>${flight.days} 天</td><td><strong>${money(flight.total_twd)}</strong></td><td class="times">${esc(time24(flight.outbound_time))}</td><td>${esc(flight.outbound_duration || '—')}</td><td class="times">${esc(time24(flight.return_time))}</td><td>${esc(flight.return_duration || '—')}</td><td><strong>${duration(flight.total_minutes)}</strong></td><td><a class="flight-result-open" href="${esc(flight.url)}" target="_blank" rel="noopener noreferrer">${esc(provider)}</a></td></tr>`;
    }).join('');
  }

  function renderFlightCards(container, results, options = {}) {
    const provider = options.provider || 'Google Flights';
    container.classList.add('flight-result-list');
    container.innerHTML = results.map(flight => {
      const carrier = flight.carrier || options.carrierName?.(flight) || '航空公司待確認';
      return `<article class="flight-result-card"><div class="flight-result-carrier">${logos(carrier)}<div><strong>${esc(carrier)}</strong><small>${esc(flight.origin)}－${esc(flight.destination)}</small></div></div><div><strong>${esc(time24(flight.outbound_time))}</strong><small>回程 ${esc(time24(flight.return_time))}</small></div><div><span>${esc(flight.outbound_duration || '—')}</span><small>合計 ${duration(flight.total_minutes)}</small></div><div><strong>直飛</strong><small>${shortDate(flight.departure)}－${shortDate(flight.return)}</small></div><div><span class="flight-result-baggage">${esc(options.baggage || '行李待確認')}</span><small>${flight.days} 天</small></div><div class="flight-result-fare"><strong>${money(flight.total_twd)}</strong><small>兩人來回 · 每人 ${money(flight.total_twd / 2)}</small><a href="${esc(flight.url)}" target="_blank" rel="noopener noreferrer">${esc(provider)} ↗</a></div></article>`;
    }).join('') || `<div class="flight-result-empty">${esc(options.emptyText || '沒有符合條件的航班')}</div>`;
  }

  async function pollLocal(options) {
    const response = await fetch('/api/status').catch(() => null);
    if (!response?.ok) return;
    options.panel.hidden = false;
    const state = await response.json();
    options.state.textContent = state.running ? '搜尋中…' : state.failed ? '搜尋失敗' : '搜尋完成';
    options.status.hidden = !state.running && !state.failed;
    options.status.textContent = state.log;
    if (state.running) setTimeout(() => pollLocal(options), 1500);
    else { options.button.disabled = false; await options.onComplete?.(); }
  }

  function downloadResults(filename, results) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([JSON.stringify({ savedAt: new Date().toISOString(), results }, null, 2)], { type: 'application/json' }));
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 0);
  }

  const formatUpdatedAt = value => value ? new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Taipei' }).format(new Date(value)) : '';

  console.assert(time24('下午5:50 – 清晨7:25+1') === '17:50 – 07:25+1');
  window.FlightUI = { downloadResults, formatUpdatedAt, pollLocal, renderFlightCards, renderResultTable, renderTickets, time24 };
  mountNavigation();
})();
