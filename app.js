'use strict';
/* Auto Insurance Finder: information only. Never asks for SSN, driver's license number, full VIN, bank/card numbers or passwords. */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n, d = 0) => (n == null || isNaN(n)) ? 'n/a' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtDate = (iso) => { if (!iso) return 'n/a'; const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
const fmtDT = (iso) => { if (!iso) return 'n/a'; const d = new Date(iso); return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago', timeZoneName: 'short' }); };
const store = {
  get(k, d) { try { const v = localStorage.getItem('aif-' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('aif-' + k, JSON.stringify(v)); } catch (e) {} }
};
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let DATA = null, STATUS = null;
const LIVE = store.get('live', {});   // in-browser reachability checks
const S = Object.assign({ ds: 'mg65', cov: 'full', sort: 'cheap', fDel: false, fOpen: false, fData: false, q: '' }, store.get('cmp', {}));

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600); }
function initials(n) { return n.replace(/\(.*?\)/g, '').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase(); }
function ext(url, label, cls = 'btn') { return `<a class="${cls}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`; }
function phoneHref(p) { return 'tel:+1' + String(p).replace(/\D/g, '').replace(/^1/, ''); }
function phoneTxt(p) { const d = String(p).replace(/\D/g, '').replace(/^1/, ''); return d.length === 10 ? d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6) : String(p); }
function telBtn(p, label, cls = 'btn ghost') { if (!p) return ''; return `<a class="${cls}" href="${phoneHref(p)}">📞 ${esc(label || phoneTxt(p))}</a>`; }
function groupLists(groups) {
  if (!groups || !groups.length) return '';
  return groups.map((g) => `<p class="small"><b>${esc(g.label)}</b></p><ul class="detail-list">${(g.items || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>${g.src ? `<p class="small muted">Source: ${srcLink(g.src)}</p>` : ''}`).join('');
}
function extraDetails(i) {
  const parts = [];
  if (i.texasNote) parts.push(`<p class="small"><b>Texas availability:</b> ${esc(i.texasNote)}</p>`);
  const calls = [];
  if (i.phone) calls.push(`Quote: <a href="${phoneHref(i.phone)}">${esc(phoneTxt(i.phone))}</a>`);
  if (i.customerPhone) calls.push(`Customer care: <a href="${phoneHref(i.customerPhone)}">${esc(phoneTxt(i.customerPhone))}</a>`);
  if (i.claims && i.claims.phone) {
    let c = `Claims${i.claims.hours ? ' (' + esc(i.claims.hours) + ')' : ''}: <a href="${phoneHref(i.claims.phone)}">${esc(phoneTxt(i.claims.phone))}</a>`;
    if (i.claims.spanish) c += ` · Spanish: <a href="${phoneHref(i.claims.spanish)}">${esc(phoneTxt(i.claims.spanish))}</a>`;
    if (i.claims.url) c += ' · ' + `<a href="${esc(i.claims.url)}" target="_blank" rel="noopener noreferrer">File or track a claim</a>`;
    calls.push(c);
  }
  if (calls.length) parts.push(`<p class="small"><b>Call:</b><br>${calls.join('<br>')}</p>`);
  if (i.discountGroups) parts.push(groupLists(i.discountGroups));
  if (i.coverageGroups) parts.push(groupLists(i.coverageGroups));
  if (i.affiliatesNote) parts.push(`<p class="small"><b>Related companies:</b> ${esc(i.affiliatesNote)}${i.affiliatesSrc ? ' Source: ' + srcLink(i.affiliatesSrc) : ''}</p>`);
  return parts.join('');
}
function srcLink(key) { const s = DATA.sources[key]; if (!s) return ''; return `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.name)}</a>${s.updated ? ' (' + fmtDate(s.updated) + ')' : ''}`; }
function countUp(el, to, prefix = '$') {
  if (reduced || to == null) { el.textContent = to == null ? 'n/a' : prefix + Math.round(to).toLocaleString(); return; }
  const start = performance.now(), dur = 700;
  const step = (t) => { const p = Math.min(1, (t - start) / dur); el.textContent = prefix + Math.round(to * (1 - Math.pow(1 - p, 3))).toLocaleString(); if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

/* ---------- data helpers ---------- */
const dsById = (id) => DATA.datasets.find((d) => d.id === id);
function monthly(ins, dsId, cov) {
  const r = ins.rates && ins.rates[dsId]; if (!r || r[cov] == null) return null;
  return dsById(dsId).period === 'year' ? r[cov] / 12 : r[cov];
}
function dsAvg(dsId, cov) { const d = dsById(dsId); const v = cov === 'full' ? d.avgFull : d.avgMin; if (v == null) return null; return d.period === 'year' ? v / 12 : v; }
function siteState(id) {
  const l = LIVE[id]; if (l && STATUS && (!STATUS.checked || l.t > STATUS.checked)) return l;
  const s = STATUS && STATUS.sites && STATUS.sites[id]; if (s) return { state: s.state, t: STATUS.checked };
  return l || { state: 'unknown' };
}
const stateText = { up: 'Website online', blocked: 'Website online (blocks robot checks)', error: 'Website had an error at last check', unknown: 'Could not check this website automatically' };
const delText = { yes: 'Delivery add-on', likely: 'Delivery: likely', no: 'No delivery cover in TX', unknown: 'Delivery: ask' };
const delCls = { yes: 'ok', likely: 'ok', no: 'bad', unknown: 'warn' };
function valueScore(ins) {
  const p = monthly(ins, S.ds, S.cov), avg = dsAvg(S.ds, S.cov) || avgOf(S.ds, S.cov);
  if (p == null || ins.jdp == null || !avg) return null;
  return Math.round(((ins.jdp / DATA.jdpTexasAvg) * (avg / p)) * 100);
}
function avgOf(dsId, cov) { const v = DATA.insurers.map((i) => monthly(i, dsId, cov)).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; }

/* ---------- router ---------- */
const VIEWS = { compare: viewCompare, estimate: viewEstimate, quotes: viewQuotes, mine: viewMine, delivery: viewDelivery, save: viewSave, learn: viewLearn };
function route() {
  const name = (location.hash.replace(/^#\/?/, '').split('?')[0]) || 'compare';
  const fn = VIEWS[name] || viewCompare;
  $$('.tabs button').forEach((b) => b.setAttribute('aria-current', b.dataset.go === name ? 'page' : 'false'));
  const m = $('#main'); m.innerHTML = '<div class="view"></div>'; fn(m.firstChild);
  const active = $(`.tabs button[data-go="${name}"]`); if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest', inline: 'center' });
  window.scrollTo(0, 0);
}
function go(name) { if (location.hash === '#/' + name) route(); else location.hash = '#/' + name; }

/* ---------- Compare ---------- */
function viewCompare(el) {
  const dsOpts = DATA.datasets.map((d) => `<option value="${d.id}" ${d.id === S.ds ? 'selected' : ''}>${esc(d.label)}</option>`).join('');
  const st = STATUS ? fmtDT(STATUS.checked) : 'not yet';
  el.innerHTML = `
  <section class="hero">
    <h1>Find the best and cheapest car insurance</h1>
    <p class="lead">Published average Texas prices, J.D. Power customer scores, financial strength and complaint data, side by side. Tap any company to see more.</p>
    <div class="stats" id="heroStats"></div>
    <div class="car" aria-hidden="true">🚗</div>
  </section>
  <div class="card">
    <div class="controls">
      <div class="field"><label for="ds">Price data</label><select id="ds">${dsOpts}</select><small class="muted" id="dsNote"></small></div>
      <div class="field"><label for="q">Search companies</label><input id="q" type="search" placeholder="Type a name, like State Farm" value="${esc(S.q)}" autocomplete="off"></div>
    </div>
    <div class="row" style="margin-top:6px">
      <div class="seg" role="group" aria-label="Coverage">
        <button type="button" data-cov="full" aria-pressed="${S.cov === 'full'}">Full coverage</button>
        <button type="button" data-cov="min" aria-pressed="${S.cov === 'min'}">Minimum (30/60/25)</button>
      </div>
      <div class="seg" role="group" aria-label="Sort">
        <button type="button" data-sort="cheap" aria-pressed="${S.sort === 'cheap'}">💲 Cheapest</button>
        <button type="button" data-sort="rated" aria-pressed="${S.sort === 'rated'}">⭐ Best rated</button>
        <button type="button" data-sort="value" aria-pressed="${S.sort === 'value'}">🏆 Best value</button>
      </div>
    </div>
    <div class="row" style="margin-top:10px">
      <button type="button" class="chip" data-f="fDel" aria-pressed="${S.fDel}">🛵 Delivery-friendly</button>
      <button type="button" class="chip" data-f="fOpen" aria-pressed="${S.fOpen}">Open to everyone</button>
      <button type="button" class="chip" data-f="fData" aria-pressed="${S.fData}">Has a price in this data</button>
    </div>
    <p class="small muted" id="sortNote" style="margin-bottom:0"></p>
  </div>
  <div class="card"><div class="row" style="justify-content:space-between"><h2 style="margin:0">Monthly price chart</h2><small class="muted" id="chartLbl"></small></div><div class="chart" id="chart" style="margin-top:10px"></div>
    <p class="small muted" style="margin-bottom:0"><span style="display:inline-block;width:3px;height:12px;background:var(--fg);opacity:.6;vertical-align:middle"></span> thin line = Texas average in this data. Tap a bar to jump to that company.</p></div>
  <div class="row" style="justify-content:space-between;margin-top:6px"><h2 style="margin:.4em 0" id="countLbl">Companies</h2>
    <div class="row"><small class="muted" id="checkedLbl">Websites last checked: ${esc(st)}</small><button type="button" class="btn small ghost" id="checkNow">↻ Check websites now</button></div></div>
  <div class="list" id="list"></div>
  <div class="card"><h2 style="margin-top:0">Near Frisco</h2><ul>${DATA.near.map((n) => `<li>${esc(n.text)} <small class="muted">Source: ${srcLink(n.src)}</small></li>`).join('')}</ul>
    ${ext('https://www.helpinsure.com/', 'Open HelpInsure.com (Texas Dept. of Insurance)', 'btn ghost')}</div>
  <div class="card"><h2 style="margin-top:0">Sources</h2><ul class="sources small">${['mg', 'nw', 'icom', 'jdp', 'jdc'].map((k) => `<li>${srcLink(k)}${sourceFlag(k)}</li>`).join('')}</ul>
    <p class="small muted">AM Best ratings and NAIC complaint indexes come from Insurance.com (Jan 6, 2026). An NAIC index under 1.00 means fewer complaints than expected for the company's size. "n/a" means no verified number was found; tap the company's website to check. These are averages for sample drivers, not quotes. Your price will be different.</p></div>`;
  $('#ds').onchange = (e) => { S.ds = e.target.value; save(); draw(); };
  $('#q').oninput = (e) => { S.q = e.target.value; save(); draw(false); };
  $$('[data-cov]', el).forEach((b) => b.onclick = () => { S.cov = b.dataset.cov; setPressed('[data-cov]', b); save(); draw(); });
  $$('[data-sort]', el).forEach((b) => b.onclick = () => { S.sort = b.dataset.sort; setPressed('[data-sort]', b); save(); draw(); });
  $$('[data-f]', el).forEach((b) => b.onclick = () => { S[b.dataset.f] = !S[b.dataset.f]; b.setAttribute('aria-pressed', S[b.dataset.f]); save(); draw(); });
  $('#checkNow').onclick = checkSites;
  draw();
}
function sourceFlag(k) { const s = STATUS && STATUS.sources && STATUS.sources[k]; if (!s) return ''; if (s.newer) return ` <span class="badge warn">Source page updated ${fmtDate(s.pageUpdated)}: app numbers may be out of date</span>`; if (s.pageUpdated) return ` <span class="badge ok">Up to date (checked ${fmtDate(STATUS.checked.slice(0, 10))})</span>`; return ''; }
function setPressed(sel, b) { $$(sel).forEach((x) => x.setAttribute('aria-pressed', x === b)); }
function save() { store.set('cmp', { ds: S.ds, cov: S.cov, sort: S.sort, fDel: S.fDel, fOpen: S.fOpen, fData: S.fData, q: S.q }); }
function filtered() {
  const q = S.q.trim().toLowerCase();
  let arr = DATA.insurers.filter((i) => (!q || i.name.toLowerCase().includes(q)) && (!S.fDel || ['yes', 'likely'].includes(i.delivery.level)) && (!S.fOpen || i.openTo === 'Everyone') && (!S.fData || monthly(i, S.ds, S.cov) != null));
  const key = { cheap: (i) => monthly(i, S.ds, S.cov), rated: (i) => (i.jdp == null ? null : -i.jdp), value: (i) => { const v = valueScore(i); return v == null ? null : -v; } }[S.sort];
  arr.sort((a, b) => { const x = key(a), y = key(b); if (x == null && y == null) return a.name.localeCompare(b.name); if (x == null) return 1; if (y == null) return -1; return x - y; });
  return arr;
}
function draw(animateChart = true) {
  const d = dsById(S.ds), src = DATA.sources[d.src];
  $('#dsNote').innerHTML = `${esc(d.profile)} Source: ${srcLink(d.src)}.`;
  $('#sortNote').textContent = { cheap: 'Cheapest: lowest average monthly price first, using the price data you picked.', rated: 'Best rated: highest J.D. Power 2026 Texas customer satisfaction score first (Texas average is ' + DATA.jdpTexasAvg + ').', value: 'Best value: J.D. Power Texas score compared with average, times how much cheaper than average the price is. 100 = average. Only companies with both numbers get a score.' }[S.sort];
  const arr = filtered();
  // hero stats
  const priced = DATA.insurers.map((i) => ({ i, p: monthly(i, S.ds, S.cov) })).filter((x) => x.p != null).sort((a, b) => a.p - b.p);
  const top = DATA.insurers.filter((i) => i.jdp != null && i.id !== 'usaa').sort((a, b) => b.jdp - a.jdp)[0];
  const avg = dsAvg(S.ds, S.cov);
  $('#heroStats').innerHTML = `<div class="stat"><span>Cheapest in this data</span><b>${priced[0] ? esc(priced[0].i.name) : 'n/a'}</b><span id="hs1"></span></div>
    <div class="stat"><span>Texas average (${S.cov === 'full' ? 'full' : 'minimum'})</span><b id="hs2">n/a</b><span>${esc(src.name)}</span></div>
    <div class="stat"><span>Top J.D. Power Texas score</span><b>${esc(top.name)}</b><span>${top.jdp} of 1,000 (2026)</span></div>`;
  if (priced[0]) { const s = $('#hs1'); s.textContent = money(priced[0].p) + ' a month'; }
  if (avg != null) countUp($('#hs2'), avg); else $('#hs2').textContent = 'n/a';
  // chart
  const max = Math.max(...priced.map((x) => x.p), avg || 0) * 1.08;
  $('#chartLbl').textContent = `${d.short} · ${S.cov === 'full' ? 'full coverage' : 'minimum coverage'}`;
  $('#chart').innerHTML = priced.length ? priced.map((x) => `<div class="bar-row" data-jump="${x.i.id}" role="button" tabindex="0" aria-label="${esc(x.i.name)} ${money(x.p)} a month"><span>${esc(x.i.name.replace(' (Auto Club, Texas)', ''))}</span><div class="bar-track">${avg ? `<div class="avg-line" style="left:${(avg / max) * 100}%"></div>` : ''}<div class="bar" style="background:${x.i.color}" data-w="${(x.p / max) * 100}"></div></div><span class="v">${money(x.p)}</span></div>`).join('') : '<p class="muted">No prices in this data for this coverage.</p>';
  requestAnimationFrame(() => requestAnimationFrame(() => $$('#chart .bar').forEach((b) => b.style.width = b.dataset.w + '%')));
  $$('#chart [data-jump]').forEach((r) => { const f = () => { const c = $('#ins-' + r.dataset.jump); if (c) { c.classList.add('open'); c.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' }); } else toast('That company is hidden by your filters.'); }; r.onclick = f; r.onkeydown = (e) => { if (e.key === 'Enter') f(); }; });
  // list
  $('#countLbl').textContent = `${arr.length} compan${arr.length === 1 ? 'y' : 'ies'}`;
  $('#list').innerHTML = arr.map((i, n) => card(i, n)).join('') || '<p class="muted">No companies match. Clear a filter or the search box.</p>';
  $$('#list .ins-head').forEach((h) => h.onclick = () => { const c = h.closest('.ins'); c.classList.toggle('open'); h.setAttribute('aria-expanded', c.classList.contains('open')); });
}
function card(i, n) {
  const p = monthly(i, S.ds, S.cov), d = dsById(S.ds), st = siteState(i.id);
  const vs = valueScore(i);
  const rankBadge = S.sort === 'cheap' && p != null && n < 3 ? `<span class="badge top">${['🥇 Cheapest', '🥈 2nd cheapest', '🥉 3rd cheapest'][n]}</span>` : (S.sort === 'rated' && i.jdp != null && n < 3 ? `<span class="badge top">${['🥇', '🥈', '🥉'][n]} Top rated</span>` : (S.sort === 'value' && vs != null && n < 3 ? `<span class="badge top">${['🥇', '🥈', '🥉'][n]} Best value</span>` : ''));
  const jd = i.jdp == null ? '<span class="badge">J.D. Power TX: n/a</span>' : `<span class="badge ${i.jdp >= DATA.jdpTexasAvg ? 'ok' : 'warn'}">J.D. Power TX ${i.jdp}${i.jdpNote ? '*' : ''}</span>`;
  const rows = DATA.datasets.map((ds) => { const r = i.rates[ds.id]; const f = r && r.full != null ? r.full : null, m = r && r.min != null ? r.min : null; const per = ds.period === 'year' ? '/yr' : '/mo'; return `<tr><td>${esc(ds.short)}</td><td>${f == null ? 'n/a' : money(f) + per}</td><td>${m == null ? 'n/a' : money(m) + per}</td></tr>`; }).join('');
  const del = i.delivery;
  return `<article class="ins" id="ins-${i.id}" style="animation-delay:${reduced ? 0 : Math.min(n, 10) * 55}ms">
    <button type="button" class="ins-head" aria-expanded="false" aria-controls="more-${i.id}">
      <span class="logo" style="background:${i.color}">${esc(initials(i.name))}<span class="dot ${st.state}" title="${esc(stateText[st.state] || '')}"></span></span>
      <span class="ins-name"><b>${esc(i.name)}</b><small>${esc(i.openTo)}</small></span>
      <span class="price"><b>${p == null ? 'n/a' : money(p)}</b><small>${p == null ? 'no published price here' : 'a month avg' + (d.period === 'year' ? ' (from yearly)' : '')}</small></span>
      <span class="chev" aria-hidden="true">▾</span>
    </button>
    <div class="badges">${rankBadge}${jd}<span class="badge">AM Best ${esc(i.amBest || 'n/a')}</span><span class="badge ${i.naic == null ? '' : i.naic < 1 ? 'ok' : 'warn'}">Complaints ${i.naic == null ? 'n/a' : i.naic.toFixed(2)}</span><span class="badge ${delCls[del.level]}">🛵 ${delText[del.level]}</span>${vs != null && S.sort === 'value' ? `<span class="badge">Value ${vs}</span>` : ''}</div>
    <div class="ins-actions">${ext(i.quote, '🧾 Get a quote')}${telBtn(i.phone, 'Call ' + phoneTxt(i.phone))}${ext(i.site, '🌐 Visit website', 'btn ghost')}</div>
    <div class="more" id="more-${i.id}"><div><div class="more-in">
      <table><thead><tr><th>Price data</th><th>Full</th><th>Minimum</th></tr></thead><tbody>${rows}</tbody></table>
      ${i.rateNote ? `<p class="small muted">${esc(i.rateNote)}</p>` : ''}
      <p class="small"><b>J.D. Power 2026 Texas satisfaction:</b> ${i.jdp == null ? 'n/a (not in the Texas ranking)' : i.jdp + ' of 1,000 (Texas average ' + DATA.jdpTexasAvg + ')' + (i.jdpNote ? ', ' + esc(i.jdpNote) : '')}<br>
      <b>J.D. Power 2026 claims (national):</b> ${i.jdc ? '#' + i.jdc.rank + ' of ' + i.jdc.of + (i.jdc.score ? ', ' + i.jdc.score + ' of 1,000' : '') + ' (average ' + DATA.jdcAvg + ')' : 'n/a'}<br>
      <b>AM Best financial strength:</b> ${esc(i.amBest || 'n/a')} · <b>NAIC complaint index:</b> ${i.naic == null ? 'n/a' : i.naic.toFixed(2)}<br>
      <b>Driving-tracking discount program:</b> ${esc(i.telematics || 'n/a')}${i.telematicsNote ? '<br>' + esc(i.telematicsNote) : ''}${i.telematicsSrc ? ' Source: ' + srcLink(i.telematicsSrc) : ''}</p>
      ${extraDetails(i)}
      <p class="small"><b class="lvl-${del.level}">🛵 Delivery driving:</b> ${esc(del.text)} ${del.srcs.map((s) => 'Source: ' + srcLink(s)).join(' · ')}${del.link ? ' · ' + `<a href="${esc(del.link)}" target="_blank" rel="noopener noreferrer">Company page</a>` : ''}</p>
      <p class="small muted">${esc(stateText[st.state] || '')}${st.t ? ' · last checked ' + esc(fmtDT(st.t)) : ''}</p>
    </div></div></div>
  </article>`;
}
async function checkSites() {
  if (!navigator.onLine) { toast('You are offline. Connect to the internet and try again.'); return; }
  const btn = $('#checkNow'); if (btn) { btn.disabled = true; btn.textContent = 'Checking…'; }
  const t = new Date().toISOString();
  await Promise.all(DATA.insurers.map(async (i) => {
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 9000);
    try { await fetch(i.site, { mode: 'no-cors', cache: 'no-store', signal: ctl.signal }); LIVE[i.id] = { state: 'up', t }; }
    catch (e) { LIVE[i.id] = { state: 'unknown', t }; }
    finally { clearTimeout(to); }
  }));
  store.set('live', LIVE);
  const ok = DATA.insurers.filter((i) => LIVE[i.id].state === 'up').length;
  toast(`${ok} of ${DATA.insurers.length} insurer websites answered.`);
  if (btn) { btn.disabled = false; btn.textContent = '↻ Check websites now'; }
  const lbl = $('#checkedLbl'); if (lbl) lbl.textContent = 'Websites last checked: ' + fmtDT(t);
  draw(false);
}

/* ---------- Estimate ---------- */
const REC = { clean: { l: 'Clean record', f: 1 }, speed: { l: 'Speeding ticket', f: 196 / 165 }, acc: { l: 'At-fault accident', f: 228 / 165 }, dui: { l: 'DUI', f: 243 / 165 } };
const CRED = { good: { l: 'Good', f: 1 }, poor: { l: 'Poor', f: 388 / 165 } };
function viewEstimate(el) {
  const E = Object.assign({ cov: 'full', rec: 'clean', cred: 'good', del: 'yes', disc: 0 }, store.get('est', {}));
  el.innerHTML = `<h1>Estimate my rate</h1><p class="lead">A quick, rough estimate built from published Texas averages for a 65-year-old driver (the closest age group published). It is not a quote.</p>
  <div class="grid two">
    <div class="card">
      <div class="step"><span class="num">1</span><div style="flex:1"><label>What coverage?</label><div class="seg" role="group" aria-label="Coverage" style="margin-top:6px"><button type="button" data-k="cov" data-v="full">Full coverage</button><button type="button" data-k="cov" data-v="min">Minimum 30/60/25</button></div></div></div><hr style="border:0;border-top:1px solid var(--line)">
      <div class="step"><span class="num">2</span><div style="flex:1"><label>Your driving record (last 3 years)</label><div class="seg" role="group" aria-label="Driving record" style="margin-top:6px">${Object.entries(REC).map(([k, v]) => `<button type="button" data-k="rec" data-v="${k}">${v.l}</button>`).join('')}</div></div></div><hr style="border:0;border-top:1px solid var(--line)">
      <div class="step"><span class="num">3</span><div style="flex:1"><label>Your credit (Texas insurers may use it)</label><div class="seg" role="group" aria-label="Credit" style="margin-top:6px">${Object.entries(CRED).map(([k, v]) => `<button type="button" data-k="cred" data-v="${k}">${v.l}</button>`).join('')}</div></div></div><hr style="border:0;border-top:1px solid var(--line)">
      <div class="step"><span class="num">4</span><div style="flex:1"><label>Do you drive for DoorDash or deliveries?</label><div class="seg" role="group" aria-label="Delivery" style="margin-top:6px"><button type="button" data-k="del" data-v="yes">Yes</button><button type="button" data-k="del" data-v="no">No</button></div></div></div><hr style="border:0;border-top:1px solid var(--line)">
      <div class="step"><span class="num">5</span><div style="flex:1"><label for="disc">Discounts you expect: <span id="discV"></span></label><input id="disc" class="range" type="range" min="0" max="30" step="1" value="${E.disc}"><small class="muted">Your own guess (bundling, safe-driving app, paid in full, defensive driving course). Actual discounts vary by company.</small></div></div>
    </div>
    <div class="card"><h2 style="margin-top:0">Your rough monthly estimate</h2><div id="estOut"></div></div>
  </div>
  <div class="card small muted"><b>How this is worked out.</b> Starting price = MoneyGeek's Texas average for each company, 65-year-old driver, clean record, good credit (${srcLink('mg')}). Record and credit change the price by the same percentage MoneyGeek's Texas averages change for those drivers: speeding ticket +19%, at-fault accident +38%, DUI +47%, poor credit +135% (40-year-old full-coverage data). Delivery adds the $100 to $360 a year that InsureMojo reports for a rideshare/delivery add-on (${srcLink('im')}). Real quotes depend on your car, ZIP, mileage, claims and the company.</div>`;
  const paint = () => {
    $$('[data-k]', el).forEach((b) => b.setAttribute('aria-pressed', E[b.dataset.k] === b.dataset.v));
    $('#discV').textContent = E.disc + '%';
    const f = REC[E.rec].f * CRED[E.cred].f * (1 - E.disc / 100);
    const list = DATA.insurers.map((i) => ({ i, b: monthly(i, 'mg65', E.cov) })).filter((x) => x.b != null).map((x) => ({ ...x, lo: x.b * f + (E.del === 'yes' ? 100 / 12 : 0), hi: x.b * f + (E.del === 'yes' ? 360 / 12 : 0) })).sort((a, b) => a.lo - b.lo);
    const max = Math.max(...list.map((x) => x.hi)) * 1.05;
    const warn = E.del === 'yes' ? `<div class="note small">🛵 Because you deliver, ask each company for delivery or business-use coverage. Without it, a claim made while delivering can be denied. GEICO's delivery coverage is reported as not sold in Texas. <a href="#/delivery">See delivery details</a></div>` : '';
    $('#estOut').innerHTML = warn + list.map((x, n) => `<div class="est-row"><div><b>${n === 0 ? '🥇 ' : ''}${esc(x.i.name)}</b>${E.del === 'yes' && x.i.delivery.level === 'no' ? ' <span class="badge bad">no delivery cover in TX</span>' : ''}<div class="bar-track"><div class="bar" style="background:${x.i.color}" data-w="${(x.hi / max) * 100}"></div></div></div><div style="text-align:right"><span class="big" data-to="${x.lo}">$0</span>${E.del === 'yes' ? `<br><small class="muted">to ${money(x.hi)}</small>` : '<br><small class="muted">a month</small>'}</div></div>`).join('') + `<p class="small muted">Only companies with published 65-year-old prices are shown. <a class="btn small" href="#/quotes">Get real quotes</a></p>`;
    requestAnimationFrame(() => requestAnimationFrame(() => $$('#estOut .bar').forEach((b) => b.style.width = b.dataset.w + '%')));
    $$('#estOut [data-to]').forEach((s) => countUp(s, +s.dataset.to));
    store.set('est', E);
  };
  $$('[data-k]', el).forEach((b) => b.onclick = () => { E[b.dataset.k] = b.dataset.v; paint(); });
  $('#disc').oninput = (e) => { E.disc = +e.target.value; paint(); };
  paint();
}

/* ---------- Get quotes ---------- */
function viewQuotes(el) {
  el.innerHTML = `<h1>Get real quotes</h1><p class="lead">Each button opens the company's own website in a new tab. Get 3 or more quotes with the same coverage, then add them under My quotes.</p>
  <div class="grid two">
    <div class="card"><h2 style="margin-top:0">🏛️ Texas tools (free)</h2>
      <p><b>HelpInsure.com</b> is the Texas Department of Insurance's comparison site. It shows sample yearly prices by company for your area and coverage level.</p>
      <div class="row">${ext('https://www.helpinsure.com/', 'Open HelpInsure.com')}${ext('https://www.opic.texas.gov/auto-insurance/shopping-guide/', 'OPIC shopping guide', 'btn ghost')}</div>
      <p class="small muted">OPIC is the Texas Office of Public Insurance Counsel.</p></div>
    <div class="card"><h2 style="margin-top:0">⚖️ Texas minimum coverage</h2>
      <p>Texas law requires liability of at least <b>$30,000</b> per injured person, <b>$60,000</b> per accident for injuries, and <b>$25,000</b> for property damage. This is called <b>30/60/25</b>.</p>
      <p class="small">Every Texas policy includes PIP and must offer uninsured motorist coverage unless you turn them down in writing. Source: ${srcLink('tdi')}.</p></div>
  </div>
  <div class="card"><h2 style="margin-top:0">Have this ready</h2><ul><li>Your car's year, make and model, and how many miles you drive a year</li><li>Your current policy's coverage page (to compare the same limits)</li><li>Tell them you deliver for DoorDash/Apex Elite Courier and ask for delivery or business-use coverage</li></ul>
    <div class="note small">🔒 This app never asks for your Social Security number, driver's license number, full VIN, bank or card numbers, or passwords. If a company needs those, type them only on that company's official site.</div></div>
  <h2>Official quote pages</h2><div class="list">${DATA.insurers.map((i, n) => `<div class="card ins" style="margin:0;animation-delay:${n * 40}ms;padding:0"><div class="ins-head" style="cursor:default"><span class="logo" style="background:${i.color}">${esc(initials(i.name))}<span class="dot ${siteState(i.id).state}"></span></span><span class="ins-name"><b>${esc(i.name)}</b><small>${esc(i.openTo)}</small></span></div><div class="ins-actions">${ext(i.quote, '🧾 Get a quote')}${telBtn(i.phone, 'Call ' + phoneTxt(i.phone))}${ext(i.site, '🌐 Website', 'btn ghost')}</div></div>`).join('')}</div>`;
}

/* ---------- My quotes ---------- */
const LIMITS = ['30/60/25 (Texas minimum)', '50/100/50', '100/300/100', '250/500/100', '250/500/250', 'Other'];
function viewMine(el) {
  const Q = store.get('quotes', []);
  const names = DATA.insurers.map((i) => i.name);
  el.innerHTML = `<h1>My quotes</h1><p class="lead">Type in quotes you get. The app turns every quote into a monthly price and ranks them. Saved only on this device.</p>
  <div class="grid two">
  <form class="card" id="qf" autocomplete="off"><h2 style="margin-top:0">Add a quote</h2>
    <div class="field"><label for="qi">Company</label><input id="qi" list="qil" required placeholder="Start typing…"><datalist id="qil">${names.map((n) => `<option value="${esc(n)}">`).join('')}</datalist></div>
    <div class="grid two" style="gap:8px"><div class="field"><label for="qp">Price ($)</label><input id="qp" type="number" min="1" step="0.01" inputmode="decimal" required></div>
    <div class="field"><label for="qt">For how long</label><select id="qt"><option value="1">1 month</option><option value="6" selected>6 months</option><option value="12">12 months</option></select></div></div>
    <div class="grid two" style="gap:8px"><div class="field"><label for="qd">Deductible ($)</label><input id="qd" type="number" min="0" step="50" inputmode="numeric" placeholder="e.g. 1000"></div>
    <div class="field"><label for="ql">Liability limits</label><select id="ql">${LIMITS.map((l) => `<option>${l}</option>`).join('')}</select></div></div>
    <div class="grid two" style="gap:8px"><div class="field"><label for="qc">Coverage</label><select id="qc"><option>Full coverage</option><option>Liability only</option></select></div>
    <div class="field"><label for="qdel">Covers delivery driving?</label><select id="qdel"><option>Not sure</option><option>Yes</option><option>No</option></select></div></div>
    <div class="field"><label for="qv">Car VIN last 4 (optional)</label><input id="qv" maxlength="4" pattern="[A-Za-z0-9]{0,4}" placeholder="Last 4 only"></div>
    <div class="field"><label for="qn">Notes</label><textarea id="qn" maxlength="300" placeholder="Discounts, agent name, quote date…"></textarea></div>
    <button class="btn" type="submit">➕ Add quote</button></form>
  <div class="card"><div class="row" style="justify-content:space-between"><h2 style="margin:0">Ranked cheapest first</h2><div class="row"><button type="button" class="btn small ghost" id="exp">⬇️ Export</button><label class="btn small ghost" style="font-weight:650">⬆️ Import<input type="file" id="imp" accept="application/json,.json" hidden></label></div></div><div id="ql2"></div></div></div>`;
  const list = () => {
    const arr = Q.map((q, idx) => ({ ...q, idx, m: q.price / q.term })).sort((a, b) => a.m - b.m);
    $('#ql2').innerHTML = arr.length ? arr.map((q, n) => `<div class="q ${n === 0 ? 'best' : ''}" style="animation-delay:${n * 50}ms"><span class="medal">${['🥇', '🥈', '🥉'][n] || '•'}</span><div><b>${esc(q.ins)}</b> · ${esc(q.cov)}<br><small class="muted">${money(q.price, 2)} for ${q.term} month${q.term > 1 ? 's' : ''} · ${esc(q.lim)}${q.ded ? ' · ' + money(q.ded) + ' deductible' : ''} · delivery: ${esc(q.del)}${q.vin ? ' · VIN …' + esc(q.vin) : ''}</small>${q.notes ? `<br><small>${esc(q.notes)}</small>` : ''}${q.del === 'No' ? '<br><span class="badge bad">Not covered while delivering</span>' : ''}</div><div style="text-align:right"><b class="big">${money(q.m, 0)}</b><br><small class="muted">a month · ${money(q.m * 12)}/yr</small><br><button type="button" class="btn small danger" data-del="${q.idx}">Delete</button></div></div>`).join('') + (arr.length > 1 ? `<div class="good small">Cheapest: <b>${esc(arr[0].ins)}</b>. It saves ${money((arr[arr.length - 1].m - arr[0].m) * 12)} a year over the most expensive quote. Check that coverage limits and deductibles match before choosing.</div>` : '') : '<p class="muted">No quotes yet. Add your first one.</p>';
    $$('[data-del]').forEach((b) => b.onclick = () => { if (confirm('Delete this quote?')) { Q.splice(+b.dataset.del, 1); store.set('quotes', Q); list(); } });
  };
  $('#qf').onsubmit = (e) => {
    e.preventDefault();
    const vin = $('#qv').value.trim().replace(/[^A-Za-z0-9]/g, '').slice(-4).toUpperCase();
    const q = { ins: $('#qi').value.trim().slice(0, 60), price: +$('#qp').value, term: +$('#qt').value, ded: $('#qd').value ? +$('#qd').value : null, lim: $('#ql').value, cov: $('#qc').value, del: $('#qdel').value, vin, notes: $('#qn').value.trim().slice(0, 300), added: new Date().toISOString() };
    if (!q.ins || !(q.price > 0)) { toast('Enter a company and a price.'); return; }
    Q.push(q); store.set('quotes', Q); e.target.reset(); $('#qt').value = '6'; toast('Quote added'); list();
  };
  $('#exp').onclick = () => { const blob = new Blob([JSON.stringify({ app: 'Auto Insurance Finder', exported: new Date().toISOString(), quotes: Q }, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'my-car-insurance-quotes.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  $('#imp').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const j = JSON.parse(await f.text()); const arr = Array.isArray(j) ? j : j.quotes; if (!Array.isArray(arr)) throw 0; let n = 0; arr.forEach((q) => { if (q && q.ins && q.price > 0 && [1, 6, 12].includes(+q.term)) { Q.push({ ins: String(q.ins).slice(0, 60), price: +q.price, term: +q.term, ded: q.ded == null ? null : +q.ded, lim: String(q.lim || 'Other').slice(0, 40), cov: String(q.cov || 'Full coverage').slice(0, 30), del: ['Yes', 'No', 'Not sure'].includes(q.del) ? q.del : 'Not sure', vin: String(q.vin || '').replace(/[^A-Za-z0-9]/g, '').slice(-4), notes: String(q.notes || '').slice(0, 300), added: q.added || new Date().toISOString() }); n++; } }); store.set('quotes', Q); list(); toast(`Imported ${n} quote${n === 1 ? '' : 's'}`); }
    catch (err) { toast('That file could not be read.'); }
    e.target.value = '';
  };
  list();
}

/* ---------- Delivery ---------- */
function viewDelivery(el) {
  const lv = { yes: 0, likely: 1, unknown: 2, no: 3 };
  const arr = [...DATA.insurers].sort((a, b) => lv[a.delivery.level] - lv[b.delivery.level]);
  el.innerHTML = `<h1>🛵 Coverage for delivery drivers</h1>
  <div class="note"><b>Important:</b> many personal car policies treat delivery work as "business use" and may deny a claim made while you're delivering. Tell your insurer you deliver for DoorDash and Apex Elite Courier, and get delivery or business-use coverage in writing.</div>
  <div class="grid two"><div class="card"><h2 style="margin-top:0">What DoorDash covers</h2><ul><li>Third-party liability up to $1,000,000 in most states, while on an active delivery.</li><li>Occupational accident coverage if you're hurt on an active delivery.</li><li><b>Not</b> repairs to your own car. That only comes from your own policy, and only if it covers delivery.</li></ul><p class="small">Source: ${srcLink('dd')}</p></div>
  <div class="card"><h2 style="margin-top:0">Your options</h2><ol><li><b>Delivery or rideshare add-on</b> to a personal policy. Reported cost is about $100 to $360 a year (${srcLink('im')}).</li><li><b>Commercial auto policy</b>, written for business use. This may be needed if you drive for your own courier business (Apex Elite Courier). Ask an agent.</li></ol></div></div>
  <h2>Company by company (Texas)</h2>
  <div class="list">${arr.map((i, n) => `<div class="card ins" style="margin:0;animation-delay:${n * 40}ms"><div class="row" style="justify-content:space-between"><b>${esc(i.name)}</b><span class="badge ${delCls[i.delivery.level]}">${delText[i.delivery.level]}</span></div><p class="small">${esc(i.delivery.text)}</p><p class="small muted">${i.delivery.srcs.map((s) => 'Source: ' + srcLink(s)).join(' · ')}</p><div class="row">${i.delivery.link ? ext(i.delivery.link, 'Read their delivery page', 'btn small') : ''}${ext(i.quote, 'Get a quote', 'btn small ghost')}</div></div>`).join('')}</div>
  <p class="small muted">"Likely" means a reliable source says it's offered, but the company didn't name Texas or food delivery specifically. Always confirm with the company.</p>`;
}

/* ---------- Save ---------- */
const TIPS = [
  ['shop', 'Compare 3 or more quotes every renewal', 'Prices for the same driver differ by hundreds of dollars a year between companies. Use HelpInsure.com and the Compare tab.'],
  ['bundle', 'Bundle car with home or renters insurance', 'Most big companies give a multi-policy discount.'],
  ['telem', 'Try a safe-driving app (telematics)', 'Examples: State Farm Drive Safe & Save, Progressive Snapshot, GEICO DriveEasy, Allstate Drivewise, Nationwide SmartRide, Farmers Signal. Ask if it can raise your price; some can.'],
  ['ddc', 'Take a Texas defensive driving course', 'The Texas Department of Insurance says companies often give a discount for it. Each company sets its own terms, so ask first.'],
  ['mature', 'Ask about a mature-driver discount', 'Some companies give one to drivers over a set age, often after a driving course. Ask each company.'],
  ['pif', 'Pay in full, use autopay and paperless', 'Many companies charge less when you pay the whole term up front or sign up for autopay or paperless bills.'],
  ['term', 'Consider a 12-month policy', 'NerdWallet notes a 12-month term locks your price for a year instead of 6 months.'],
  ['ded', 'Raise your deductible', 'A higher deductible lowers your price. Pick one you could pay tomorrow.'],
  ['drop', 'Drop full coverage on an older, paid-off car', 'MoneyGeek suggests liability-only may make sense if the car is worth under about $5,000 and paid off.'],
  ['miles', 'Report your real mileage', 'Fewer miles can mean a lower price. Delivery miles count, so be honest.'],
  ['clean', 'Keep your record clean', 'In Texas, most tickets fall off your record after 3 years. Shop again when one does.'],
  ['credit', 'Shop again when your credit improves', 'Texas allows insurers to use credit-based scores, so a better score can lower your price.'],
  ['member', 'Use memberships', 'AAA and Farm Bureau insurance require membership. Military families should check USAA.'],
  ['extras', 'Don\'t pay twice for extras', 'If you already have roadside help (for example through AAA), you may not need towing coverage on your policy.']
];
function viewSave(el) {
  const done = store.get('tips', {});
  el.innerHTML = `<h1>💰 Ways to save</h1><p class="lead">Tap each one as you do it. Your progress is saved on this device.</p>
  <div class="card"><div class="row" style="justify-content:space-between"><b id="pct"></b><button type="button" class="btn small ghost" id="reset">Start over</button></div><div class="progress" style="margin-top:8px"><div id="bar"></div></div></div>
  <div id="tips">${TIPS.map(([k, t, d]) => `<label class="check ${done[k] ? 'done' : ''}"><input type="checkbox" data-t="${k}" ${done[k] ? 'checked' : ''}><span><b>${esc(t)}</b><br><span class="small muted">${esc(d)}</span></span></label>`).join('')}</div>`;
  const upd = () => { const n = TIPS.filter(([k]) => done[k]).length; $('#pct').textContent = `${n} of ${TIPS.length} done`; requestAnimationFrame(() => $('#bar').style.width = (n / TIPS.length * 100) + '%'); };
  $$('[data-t]').forEach((c) => c.onchange = () => { done[c.dataset.t] = c.checked; c.closest('.check').classList.toggle('done', c.checked); store.set('tips', done); upd(); if (TIPS.every(([k]) => done[k])) toast('🎉 All done!'); });
  $('#reset').onclick = () => { Object.keys(done).forEach((k) => delete done[k]); store.set('tips', done); viewSave(el); };
  upd();
}

/* ---------- Learn ---------- */
const LEARN = [
  ['Liability (required)', 'Pays for the other people\'s injuries and car or property damage when you cause a crash. Texas minimum is 30/60/25: $30,000 per injured person, $60,000 per accident for injuries, $25,000 for property damage. Those limits can run out fast in a serious crash, so many people buy more, like 100/300/100.'],
  ['Collision', 'Pays to fix or replace your own car after a crash, no matter who caused it. You pay the deductible first. Your lender requires it if you have a car loan or lease.'],
  ['Comprehensive', 'Pays if your car is stolen or damaged by hail, flood, fire, vandalism, falling objects or hitting an animal. Important around Dallas–Fort Worth, where hail claims are common.'],
  ['"Full coverage"', 'Not an official type. It usually means liability plus collision plus comprehensive.'],
  ['Personal injury protection (PIP)', 'Pays medical bills and some lost wages for you and your passengers, no matter who caused the crash. Every Texas policy includes it unless you turn it down in writing.'],
  ['Uninsured / underinsured motorist', 'Pays when a driver with no insurance, or not enough, hits you, and in hit-and-run crashes (report a hit-and-run to police). Companies must offer it; you must reject it in writing if you don\'t want it.'],
  ['Medical payments (MedPay)', 'Pays medical bills for you and your passengers. Similar to PIP but doesn\'t cover lost wages.'],
  ['Towing and labor', 'Pays for a tow, flat-tire change or jump-start.'],
  ['Rental reimbursement', 'Pays for a rental car while yours is being repaired after a covered claim.'],
  ['Deductible', 'The amount you pay before insurance pays on collision or comprehensive claims. Higher deductible = lower price.'],
  ['Gap insurance', 'If your car is totaled, insurance pays its current value, which can be less than your loan. Gap pays the difference. J.D. Power\'s 2026 claims study found 25% of total-loss customers with car loans got less than they owed.'],
  ['Business use / delivery', 'Driving for pay (DoorDash, courier work) may not be covered by a regular personal policy. See the Delivery tab.'],
  ['New car on your policy', 'In Texas, a newly bought car is usually covered automatically for about 20 days. Tell your company right away.'],
  ['Driving into Mexico', 'Mexico doesn\'t recognize U.S. policies. Buy Mexican liability insurance before you go.'],
  ['Cancellation and nonrenewal', 'A company must give 10 days\' notice to cancel and must refund unused premium within 15 days. It can\'t refuse to renew you because of your age.']
];
function viewLearn(el) {
  el.innerHTML = `<h1>📘 Coverage in plain English</h1><p class="lead">Tap a topic to open it.</p>${LEARN.map(([t, d], n) => `<details ${n === 0 ? 'open' : ''}><summary>${esc(t)}</summary><div>${esc(d)}</div></details>`).join('')}
  <div class="card small">Source for Texas rules: ${srcLink('tdi')}. Have a problem with an insurer? ${ext('https://www.tdi.texas.gov/consumer/get-help-with-an-insurance-complaint.html', 'Texas Dept. of Insurance complaint help', '')} or call 800-252-3439.</div>
  <p class="small muted">Information only, not insurance or legal advice. This app doesn't sell insurance and isn't paid by any company.</p>`;
}

/* ---------- shell ---------- */
function net() { const p = $('#netPill'); const on = navigator.onLine; p.className = 'pill ' + (on ? 'on' : 'off'); p.textContent = on ? 'Online' : 'Offline'; p.title = on ? 'Connected to the internet' : 'No internet: showing saved data'; }
function theme() { const b = $('#themeBtn'); const dark = document.documentElement.dataset.theme === 'dark'; b.textContent = dark ? 'Light mode' : 'Dark mode'; b.setAttribute('aria-pressed', dark); }
async function load() {
  try { DATA = await (await fetch('data/insurers.json', { cache: 'no-cache' })).json(); }
  catch (e) { $('#main').innerHTML = '<div class="card">Could not load the data. Check your internet and reload.</div>'; return; }
  try { STATUS = await (await fetch('data/status.json', { cache: 'no-cache' })).json(); } catch (e) { STATUS = null; }
  route();
}
$$('.tabs button').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
$('#themeBtn').onclick = () => { const d = document.documentElement; d.dataset.theme = d.dataset.theme === 'dark' ? 'light' : 'dark'; try { localStorage.setItem('aif-theme', d.dataset.theme); } catch (e) {} theme(); };
addEventListener('hashchange', () => DATA && route());
addEventListener('online', () => { net(); toast('Back online'); });
addEventListener('offline', () => { net(); toast('You are offline. Showing saved data.'); });
net(); theme(); load();
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
