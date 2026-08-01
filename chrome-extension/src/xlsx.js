/*
 * xlsx.js — writes a single-sheet .xlsx (SpreadsheetML) from a table.
 *
 * Styling kept deliberately small: a header style, a datetime style, default
 * for everything else. Strings use inlineStr so there is no shared-string table
 * to keep in sync.
 */
var ZAE_XLSX = (function () {
  'use strict';

  // Characters that are simply not legal in XML 1.0, at any escaping level.
  var ILLEGAL = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g;

  function esc(s) {
    return String(s)
      .replace(ILLEGAL, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function colLetter(n) { // 1 -> A
    var s = '';
    while (n > 0) {
      var m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = (n - m - 1) / 26;
    }
    return s;
  }

  // Excel serial date: days since 1899-12-30. Computed from epoch ms in UTC so
  // it matches exactly what Zoho displays (Zoho formats its epoch values in UTC).
  function epochToSerial(ms) {
    return ms / 86400000 + 25569;
  }

  var CONTENT_TYPES =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '</Types>';

  var ROOT_RELS =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>';

  var WB_RELS =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '</Relationships>';

  var STYLES =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy\\ hh:mm"/></numFmts>' +
    '<fonts count="2">' +
    '<font><sz val="11"/><color theme="1"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
    '</fonts>' +
    '<fills count="3">' +
    '<fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF4472C4"/><bgColor indexed="64"/></patternFill></fill>' +
    '</fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="3">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  function workbookXml(sheetName) {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="' + esc(sheetName) + '" sheetId="1" r:id="rId1"/></sheets>' +
      '</workbook>';
  }

  /**
   * table = {
   *   sheetName: string,
   *   headers:   [string],
   *   rows:      [[cell]]          cell = string | {n:number} | {d:epochMs}
   * }
   */
  function build(table) {
    var headers = table.headers;
    var rows = table.rows;
    var nCols = headers.length;
    var lastCol = colLetter(nCols);
    var dim = 'A1:' + lastCol + (rows.length + 1);

    var out = [];
    out.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
    out.push('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">');
    out.push('<dimension ref="' + dim + '"/>');
    out.push('<sheetViews><sheetView workbookViewId="0">' +
      '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
      '</sheetView></sheetViews>');
    out.push('<sheetFormatPr defaultRowHeight="15"/>');

    // Column widths sized to content, clamped so one long free-text field does
    // not push every other column off-screen.
    out.push('<cols>');
    for (var c = 0; c < nCols; c++) {
      var w = headers[c].length;
      for (var r = 0; r < rows.length; r++) {
        var v = rows[r][c];
        var len = (v && typeof v === 'object') ? 18 : String(v == null ? '' : v).length;
        if (len > w) w = len;
        if (w >= 45) break;
      }
      w = Math.min(Math.max(w + 2, 10), 45);
      out.push('<col min="' + (c + 1) + '" max="' + (c + 1) + '" width="' + w + '" customWidth="1"/>');
    }
    out.push('</cols>');

    out.push('<sheetData>');

    // header row
    out.push('<row r="1">');
    for (var h = 0; h < nCols; h++) {
      out.push('<c r="' + colLetter(h + 1) + '1" s="1" t="inlineStr"><is><t xml:space="preserve">' +
        esc(headers[h]) + '</t></is></c>');
    }
    out.push('</row>');

    for (var i = 0; i < rows.length; i++) {
      var rowNum = i + 2;
      var row = rows[i];
      out.push('<row r="' + rowNum + '">');
      for (var k = 0; k < nCols; k++) {
        var val = row[k];
        if (val == null || val === '') continue;          // leave blank cells out entirely
        var ref = colLetter(k + 1) + rowNum;
        if (typeof val === 'object' && val.d != null) {
          out.push('<c r="' + ref + '" s="2"><v>' + epochToSerial(val.d) + '</v></c>');
        } else if (typeof val === 'object' && val.n != null) {
          out.push('<c r="' + ref + '"><v>' + val.n + '</v></c>');
        } else {
          out.push('<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' +
            esc(val) + '</t></is></c>');
        }
      }
      out.push('</row>');
    }

    out.push('</sheetData>');
    out.push('<autoFilter ref="' + dim + '"/>');
    out.push('</worksheet>');

    return ZAE_ZIP.build([
      { name: '[Content_Types].xml', text: CONTENT_TYPES },
      { name: '_rels/.rels', text: ROOT_RELS },
      { name: 'xl/workbook.xml', text: workbookXml(table.sheetName || 'Sheet1') },
      { name: 'xl/_rels/workbook.xml.rels', text: WB_RELS },
      { name: 'xl/styles.xml', text: STYLES },
      { name: 'xl/worksheets/sheet1.xml', text: out.join('') }
    ]);
  }

  return { build: build };
})();
