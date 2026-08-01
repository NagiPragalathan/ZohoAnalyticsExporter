/*
 * parser.js — turns captured Zoho Analytics data-view payloads into a flat table.
 *
 * Shape of a pivot payload (the one open-view pivot reports use):
 *
 *   dataTextNew = { "0": { n:{ov,fv}, "0": { n:{ov,fv}, ... { n:{}, v:[...] } } } }
 *
 * Each nesting level is one row-dimension column; sibling keys ("0","1","2"…)
 * are the distinct values at that level. Repeated values are collapsed, so the
 * path from the root down to a leaf reconstructs one full data row, and the
 * number of LEAVES is the true row count. `v` at the leaf holds the cells for
 * the column-axis members (empty when the pivot has no measure configured).
 */
var ZAE_PARSER = (function () {
  'use strict';

  // Zoho escapes a handful of characters in its "original value" strings.
  function decodeEnt(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&hyp;/g, '-')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&');
  }

  var NULL_TOKENS = { '--NULL--': 1, '-No Value-': 1, '&hyp;&hyp;NULL&hyp;&hyp;': 1, '--NULL---': 1 };

  function cellText(n) {
    if (!n) return '';
    var v = (n.fv != null) ? n.fv : n.ov;
    var s = decodeEnt(v);
    return NULL_TOKENS[s] ? '' : s;
  }

  function childKeys(node) {
    var out = [];
    for (var k in node) {
      if (k !== 'n' && k !== 'v' && Object.prototype.hasOwnProperty.call(node, k)) out.push(k);
    }
    out.sort(function (a, b) { return Number(a) - Number(b); });
    return out;
  }

  // How many dimension levels sit between the root and a leaf.
  function treeDepth(root) {
    var n = root, d = 0, guard = 0;
    while (n && !n.v && guard++ < 200) {
      var ks = childKeys(n);
      if (!ks.length) break;
      n = n[ks[0]];
      d++;
    }
    return d;
  }

  function firstLeaf(root) {
    var n = root, guard = 0;
    while (n && !n.v && guard++ < 200) {
      var ks = childKeys(n);
      if (!ks.length) return null;
      n = n[ks[0]];
    }
    return n;
  }

  /** Cheap total-row count without a full parse, for the live status line. */
  function peekTotal(body) {
    var m = /"navigInfo"\s*:\s*\[([^\]]*)\]/.exec(body);
    if (!m) return null;
    var parts = m[1].split(',').map(function (x) { return parseInt(x, 10); });
    return parts.length >= 6 && !isNaN(parts[5]) ? parts[5] : null;
  }

  function isPivotPayload(j) {
    return !!(j && j.dataTextNew && j.PVTColHead && j.navigInfo);
  }

  /**
   * payloads: [{url, body}]
   * returns { ok, error?, viewName, headers, rows, typed, meta }
   *   rows  — all strings (CSV)
   *   typed — same grid, dates as {d:epochMs} and numbers as {n:number} (XLSX)
   */
  function parse(payloads) {
    var docs = [];
    for (var i = 0; i < payloads.length; i++) {
      var j = null;
      try { j = JSON.parse(payloads[i].body); } catch (e) { continue; }
      if (isPivotPayload(j)) docs.push(j);
    }

    if (!docs.length) {
      return {
        ok: false,
        error: 'No pivot data response was captured. Reload the page with the ' +
               'extension enabled, wait for the grid to render, then try again. ' +
               '(Only pivot-style views are supported so far — use "Save raw JSON" ' +
               'if you need the underlying response.)'
      };
    }

    // If Zoho paginated, keep one document per navigInfo start-row and order them.
    var byStart = {};
    for (var d = 0; d < docs.length; d++) {
      var start = docs[d].navigInfo[0];
      // later response for the same window wins (e.g. after a sort/filter change)
      byStart[start] = docs[d];
    }
    var ordered = Object.keys(byStart)
      .sort(function (a, b) { return Number(a) - Number(b); })
      .map(function (k) { return byStart[k]; });

    var base = ordered[ordered.length - 1];

    // ---- headers ----------------------------------------------------------
    var dimCount = treeDepth(base.dataTextNew);
    var leaf = firstLeaf(base.dataTextNew);
    var axisCount = (leaf && leaf.v) ? leaf.v.length : 0;

    if (!dimCount) return { ok: false, error: 'Captured a data response but could not read its row structure.' };

    var pvt = base.PVTColHead || [];
    var colHead = base.colHead || [];
    var SORT_SUFFIX = / sorted in (Ascending|Descending) order\.$/;

    var headers = [];
    for (var h = 0; h < dimCount; h++) {
      var label = pvt[h] && pvt[h][3];
      if (label && SORT_SUFFIX.test(label)) label = label.replace(SORT_SUFFIX, '');
      if (!label && colHead[h]) label = colHead[h][2];
      headers.push(decodeEnt(label || ('Column ' + (h + 1))));
    }

    var members = [];
    for (var m2 = 0; m2 < axisCount; m2++) {
      var e = pvt[dimCount + m2];
      members.push(decodeEnt((e && e[2]) || ('Value ' + (m2 + 1))));
    }
    var axisName = (base.structDet && base.structDet.xAxisConfig && base.structDet.xAxisConfig[0] &&
                    base.structDet.xAxisConfig[0].colName) || 'Value';

    // Which dimension columns are dates? colHead[i][6] is the column type and
    // n.ov for those is epoch milliseconds — exact, and immune to the account's
    // display-locale settings.
    var isDateCol = [];
    for (var dc = 0; dc < dimCount; dc++) {
      isDateCol.push(!!(colHead[dc] && typeof colHead[dc][6] === 'string' && /DATE/i.test(colHead[dc][6])));
    }

    // ---- flatten ----------------------------------------------------------
    var rows = [];     // display text for every cell
    var epochs = [];   // sparse per-row map colIndex -> epoch ms, for date columns
    var ragged = 0;
    var anyAxisValue = false;

    function walk(node, path, eps) {
      if (!node || typeof node !== 'object') return;
      if (node.v) {
        var axisCells = [];
        for (var a = 0; a < node.v.length; a++) {
          var t = cellText(node.v[a]);
          if (t !== '') anyAxisValue = true;
          axisCells.push(t);
        }
        if (path.length !== dimCount) ragged++;
        rows.push(path.slice().concat(axisCells));
        epochs.push(eps);
        return;
      }
      var ks = childKeys(node);
      for (var i2 = 0; i2 < ks.length; i2++) {
        var child = node[ks[i2]];
        var depth = path.length;
        var text = cellText(child.n);
        var nextEps = eps;

        if (isDateCol[depth] && child.n && /^-?\d{10,}$/.test(String(child.n.ov))) {
          nextEps = Object.assign({}, eps);
          nextEps[depth] = Number(child.n.ov);
        }

        walk(child, path.concat([text]), nextEps);
      }
    }
    walk(base.dataTextNew, [], {});

    // ---- typing -----------------------------------------------------------
    // A column becomes numeric only if EVERY non-empty value in it is a plain
    // number. Per-cell conversion would give a column mixed types and would
    // silently turn "007" into 7 or truncate an 18-digit utm id, so it is done
    // per column with leading zeros and long digit strings excluded.
    var NUMERIC = /^-?\d{1,9}(\.\d+)?$/;
    var totalCols = rows.length ? rows[0].length : headers.length;
    var numericCol = [];
    for (var nc = 0; nc < totalCols; nc++) {
      var name = headers[nc] || '';
      var eligible = !isDateCol[nc] && !/^phone$/i.test(name) && !/^utm_/i.test(name);
      var sawValue = false;
      if (eligible) {
        for (var rr = 0; rr < rows.length; rr++) {
          var cv = rows[rr][nc];
          if (cv === '') continue;
          sawValue = true;
          if (!NUMERIC.test(cv) || /^-?0\d/.test(cv)) { eligible = false; break; }
        }
      }
      numericCol.push(eligible && sawValue);
    }

    var typed = [];
    for (var tr = 0; tr < rows.length; tr++) {
      var src = rows[tr], eps2 = epochs[tr], dst = new Array(src.length);
      for (var tc = 0; tc < src.length; tc++) {
        if (eps2 && eps2[tc] != null) dst[tc] = { d: eps2[tc] };
        else if (numericCol[tc] && src[tc] !== '') dst[tc] = { n: Number(src[tc]) };
        else dst[tc] = src[tc];
      }
      typed.push(dst);
    }

    // Only keep the column-axis members as columns if they actually hold values.
    var finalHeaders = headers.slice();
    if (axisCount && anyAxisValue) {
      for (var mm = 0; mm < members.length; mm++) finalHeaders.push(axisName + ' - ' + members[mm]);
    } else if (axisCount) {
      for (var q = 0; q < rows.length; q++) {
        rows[q].length = dimCount;
        typed[q].length = dimCount;
      }
    }

    var expected = base.navigInfo[5];
    var viewName = (base.new_grid && base.new_grid[2]) || 'zoho_export';

    return {
      ok: true,
      viewName: viewName,
      headers: finalHeaders,
      rows: rows,
      typed: typed,
      meta: {
        expectedRows: expected,
        extractedRows: rows.length,
        complete: expected === rows.length,
        raggedRows: ragged,
        dimensionCount: dimCount,
        columnAxis: axisName,
        columnAxisMembers: members,
        columnAxisHasValues: anyAxisValue,
        responsesUsed: ordered.length
      }
    };
  }

  return { parse: parse, peekTotal: peekTotal };
})();
