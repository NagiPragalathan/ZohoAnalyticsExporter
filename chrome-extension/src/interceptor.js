/*
 * interceptor.js  —  runs in the MAIN world at document_start.
 *
 * Zoho Analytics renders its grid from a virtualised DOM: only the ~40 rows you
 * can see actually exist as elements. The complete dataset arrives over XHR in
 * one (or a few) ZDBTableDataAction responses. Scraping the DOM therefore loses
 * rows; capturing the response does not.
 *
 * This file patches XMLHttpRequest and fetch BEFORE Zoho's own bundle runs, and
 * forwards any data-view response to the isolated-world content script via
 * window.postMessage (the two worlds cannot share JS globals).
 */
(function () {
  'use strict';

  if (window.__ZAE_INTERCEPTOR__) return;
  window.__ZAE_INTERCEPTOR__ = true;

  // Endpoints that carry grid/pivot row data.
  var DATA_URL = /(ZDBTableDataAction|ZDBDataAction|AnalysisViewJSON)/i;

  function post(url, body) {
    if (typeof body !== 'string' || body.length < 2) return;
    try {
      window.postMessage({ __zae: 'payload', url: String(url), body: body }, window.location.origin);
    } catch (e) {
      /* payload too large to clone — ignore this one rather than break the page */
    }
  }

  // ---- XMLHttpRequest -----------------------------------------------------
  try {
    var XHR = window.XMLHttpRequest;
    var origOpen = XHR.prototype.open;
    var origSend = XHR.prototype.send;

    XHR.prototype.open = function (method, url) {
      try { this.__zaeUrl = url; } catch (e) {}
      return origOpen.apply(this, arguments);
    };

    XHR.prototype.send = function () {
      var xhr = this;
      try {
        xhr.addEventListener('load', function () {
          try {
            var rt = xhr.responseType;
            var isText = rt === '' || rt === 'text';
            if (isText && xhr.__zaeUrl && DATA_URL.test(String(xhr.__zaeUrl))) {
              post(xhr.__zaeUrl, xhr.responseText);
            }
          } catch (e) {}
        });
      } catch (e) {}
      return origSend.apply(this, arguments);
    };
  } catch (e) {}

  // ---- fetch --------------------------------------------------------------
  try {
    var origFetch = window.fetch;
    if (typeof origFetch === 'function') {
      window.fetch = function (input) {
        var p = origFetch.apply(this, arguments);
        try {
          var url = typeof input === 'string' ? input : (input && input.url) || '';
          if (url && DATA_URL.test(String(url))) {
            p.then(function (res) {
              try { res.clone().text().then(function (t) { post(url, t); }, function () {}); } catch (e) {}
              return res;
            }, function () {});
          }
        } catch (e) {}
        return p;
      };
    }
  } catch (e) {}
})();
