/*
 * content.js — isolated-world UI: collects payloads posted by the MAIN-world
 * interceptor, auto-scrolls the grid until nothing more loads, then exports.
 */
(function () {
  'use strict';

  if (window.__ZAE_UI__) return;
  window.__ZAE_UI__ = true;

  var payloads = [];       // {url, body}
  var seen = Object.create(null);
  var lastPayloadAt = 0;
  var result = null;       // parsed table
  var busy = false;

  // ---- payload intake -----------------------------------------------------
  window.addEventListener('message', function (ev) {
    if (ev.source !== window) return;
    var d = ev.data;
    if (!d || d.__zae !== 'payload' || typeof d.body !== 'string') return;

    // Same endpoint can fire repeatedly (sort, filter, resize). Key on url+length
    // so genuine re-fetches are kept but exact duplicates are not.
    var key = d.url + '|' + d.body.length;
    if (seen[key]) return;
    seen[key] = 1;

    payloads.push({ url: d.url, body: d.body });
    lastPayloadAt = Date.now();
    result = null;                       // invalidate any previous parse
    refreshStatus();
  }, false);

  // ---- element helpers ----------------------------------------------------
  function inPanel(el) {
    return !!(panel && (el === panel || panel.contains(el)));
  }

  function biggestScroller(axis) {
    var best = null, bestDelta = 0;
    var all = document.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var e = all[i];
      if (inPanel(e)) continue;
      var delta = axis === 'y' ? e.scrollHeight - e.clientHeight : e.scrollWidth - e.clientWidth;
      var size = axis === 'y' ? e.clientHeight : e.clientWidth;
      if (delta > 40 && size > 80 && delta > bestDelta) { best = e; bestDelta = delta; }
    }
    return best;
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // ---- auto-scroll --------------------------------------------------------
  /*
   * Scroll the grid until every row has loaded.
   *
   * The exit condition is deliberately NOT "the grid stopped growing": Zoho
   * recycles row elements as you scroll, so scrollHeight oscillates up and down
   * indefinitely and a stability test either never fires or fires by luck.
   *
   * The authoritative signal is the data itself — each response carries the
   * view's own total row count in navigInfo, so we stop the moment the rows we
   * can parse equal the rows the view says exist. Views that really do paginate
   * keep scrolling until their later pages arrive. The scrollHeight test is kept
   * only as a fallback for payload shapes we cannot parse.
   */
  async function autoScroll(onProgress) {
    var MAX_MS = 5 * 60 * 1000;
    var started = Date.now();
    var vert = biggestScroller('y');
    var passes = 0, prevHeight = -1, stable = 0;

    function tryComplete() {
      try {
        var r = ZAE_PARSER.parse(payloads);
        return (r.ok && r.meta.complete) ? r : null;
      } catch (e) { return null; }
    }

    while (Date.now() - started < MAX_MS) {
      if (vert) {
        vert = biggestScroller('y') || vert;
        vert.scrollTop = vert.scrollHeight;
      }
      passes++;

      await sleep(450);

      var quietFor = Date.now() - lastPayloadAt;
      var h = vert ? vert.scrollHeight : 0;
      if (h === prevHeight) stable++; else stable = 0;
      prevHeight = h;

      onProgress('Scrolling… pass ' + passes + ' · ' + payloads.length +
                 ' response' + (payloads.length === 1 ? '' : 's') + ' captured');

      // Every few passes, check whether what we hold is already the whole view.
      if (quietFor > 1000 && (passes <= 2 || passes % 3 === 0)) {
        var done = tryComplete();
        if (done) { result = done; break; }
      }

      if (!vert) break;                                   // nothing to scroll
      if (stable >= 10 && quietFor > 3000) break;         // fallback: grid idle
    }

    // Nudge horizontally too, so wide grids finish rendering their columns.
    var horiz = biggestScroller('x');
    if (horiz) {
      horiz.scrollLeft = horiz.scrollWidth;
      await sleep(300);
      horiz.scrollLeft = 0;
    }
    if (vert) { vert.scrollTop = 0; await sleep(150); }
  }

  // ---- downloads ----------------------------------------------------------
  function saveBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 4000);
  }

  function safeName(s) {
    return String(s || 'zoho_export').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 80);
  }

  function stamp() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes());
  }

  function toCsv(headers, rows) {
    var q = function (v) {
      var s = v == null ? '' : String(v);
      return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    var out = [headers.map(q).join(',')];
    for (var i = 0; i < rows.length; i++) out.push(rows[i].map(q).join(','));
    // BOM so Excel detects UTF-8 and non-Latin names survive.
    return '﻿' + out.join('\r\n') + '\r\n';
  }

  // ---- UI -----------------------------------------------------------------
  var panel, statusEl, metaEl, btnExtract, btnXlsx, btnCsv, btnRaw;

  function refreshStatus() {
    if (!statusEl) return;
    if (busy) return;
    if (result && result.ok) return;

    if (!payloads.length) {
      statusEl.textContent = 'Waiting for the view to load…';
      metaEl.textContent = 'If the grid is already showing, reload the page (F5).';
      return;
    }
    var total = null;
    for (var i = payloads.length - 1; i >= 0 && total == null; i--) {
      total = ZAE_PARSER.peekTotal(payloads[i].body);
    }
    statusEl.textContent = 'Data detected' + (total != null ? ' · ' + total.toLocaleString() + ' rows' : '');
    metaEl.textContent = 'Click "Scroll & extract" to load every row and build the file.';
  }

  function setBusy(on, msg) {
    busy = on;
    [btnExtract, btnXlsx, btnCsv].forEach(function (b) { if (b) b.disabled = on; });
    if (on && msg) statusEl.textContent = msg;
  }

  async function doExtract() {
    setBusy(true, 'Starting…');
    metaEl.textContent = '';
    try {
      result = null;
      await autoScroll(function (m) { statusEl.textContent = m; });

      if (!result) {                       // autoScroll parses on the way out when it can
        statusEl.textContent = 'Parsing…';
        await sleep(50);
        result = ZAE_PARSER.parse(payloads);
      }

      if (!result.ok) {
        statusEl.textContent = 'Could not extract';
        metaEl.textContent = result.error;
        btnXlsx.disabled = true;
        btnCsv.disabled = true;
        busy = false;
        btnExtract.disabled = false;
        return;
      }

      var m = result.meta;
      statusEl.textContent = result.rows.length.toLocaleString() + ' rows × ' + result.headers.length + ' columns';

      var notes = [];
      if (!m.complete) {
        notes.push('WARNING: the view reports ' + m.expectedRows +
                   ' rows but ' + m.extractedRows + ' were extracted. Scroll again or reload.');
      } else {
        notes.push('Complete — matches the ' + m.expectedRows + ' rows the view reports.');
      }
      if (m.raggedRows) notes.push(m.raggedRows + ' rows had an unexpected width.');
      if (m.columnAxisMembers.length && !m.columnAxisHasValues) {
        notes.push('"' + m.columnAxis + '" is a column axis with no measure, so its ' +
                   m.columnAxisMembers.length + ' columns are empty and were omitted.');
      }
      metaEl.textContent = notes.join(' ');

      btnXlsx.disabled = false;
      btnCsv.disabled = false;
    } catch (err) {
      statusEl.textContent = 'Error';
      metaEl.textContent = String(err && err.message ? err.message : err);
    } finally {
      busy = false;
      btnExtract.disabled = false;
    }
  }

  function downloadXlsx() {
    if (!result || !result.ok) return;
    var name = safeName(result.viewName);
    var blob = ZAE_XLSX.build({
      sheetName: name.slice(0, 31),
      headers: result.headers,
      rows: result.typed
    });
    saveBlob(blob, name + '_' + stamp() + '.xlsx');
  }

  function downloadCsv() {
    if (!result || !result.ok) return;
    var name = safeName(result.viewName);
    var blob = new Blob([toCsv(result.headers, result.rows)], { type: 'text/csv;charset=utf-8' });
    saveBlob(blob, name + '_' + stamp() + '.csv');
  }

  function downloadRaw() {
    if (!payloads.length) return;
    var body = payloads[payloads.length - 1].body;
    saveBlob(new Blob([body], { type: 'application/json' }), 'zoho_raw_' + stamp() + '.json');
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function buildPanel() {
    panel = el('div', 'zae-panel');

    var head = el('div', 'zae-head');
    head.appendChild(el('span', 'zae-dot'));
    head.appendChild(el('span', 'zae-title', 'Zoho Analytics Exporter'));
    var toggle = el('button', 'zae-toggle', '–');
    toggle.title = 'Collapse / expand';
    head.appendChild(toggle);
    panel.appendChild(head);

    var body = el('div', 'zae-body');
    statusEl = el('div', 'zae-status', 'Waiting for the view to load…');
    metaEl = el('div', 'zae-meta', '');
    body.appendChild(statusEl);
    body.appendChild(metaEl);

    btnExtract = el('button', 'zae-btn zae-primary', 'Scroll & extract');
    body.appendChild(btnExtract);

    var dl = el('div', 'zae-row');
    btnXlsx = el('button', 'zae-btn', 'Download .xlsx');
    btnCsv = el('button', 'zae-btn', 'Download .csv');
    btnXlsx.disabled = true;
    btnCsv.disabled = true;
    dl.appendChild(btnXlsx);
    dl.appendChild(btnCsv);
    body.appendChild(dl);

    btnRaw = el('button', 'zae-link', 'Save raw JSON response');
    body.appendChild(btnRaw);

    panel.appendChild(body);
    document.body.appendChild(panel);

    toggle.addEventListener('click', function () {
      var hidden = body.style.display === 'none';
      body.style.display = hidden ? '' : 'none';
      toggle.textContent = hidden ? '–' : '+';
    });
    btnExtract.addEventListener('click', doExtract);
    btnXlsx.addEventListener('click', downloadXlsx);
    btnCsv.addEventListener('click', downloadCsv);
    btnRaw.addEventListener('click', downloadRaw);

    // draggable by its header
    var dragging = false, ox = 0, oy = 0;
    head.addEventListener('mousedown', function (e) {
      if (e.target === toggle) return;
      dragging = true;
      var r = panel.getBoundingClientRect();
      ox = e.clientX - r.left;
      oy = e.clientY - r.top;
      e.preventDefault();
    });
    document.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      panel.style.left = (e.clientX - ox) + 'px';
      panel.style.top = (e.clientY - oy) + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    });
    document.addEventListener('mouseup', function () { dragging = false; });

    refreshStatus();
  }

  // Only show the panel in a frame that actually hosts a grid (the open-view
  // page nests several iframes; we do not want a panel in each).
  function hasGrid() {
    return !!document.querySelector('.zdbDArea, .zdbChArea, [class*="PivotSheet"], [id^="ZDBGrid"]');
  }

  var tries = 0;
  var poll = setInterval(function () {
    tries++;
    if (!document.body) return;
    if (hasGrid() || payloads.length) {
      clearInterval(poll);
      buildPanel();
    } else if (tries > 60) {           // ~30s
      clearInterval(poll);
    }
  }, 500);
})();
