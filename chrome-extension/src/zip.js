/*
 * zip.js — minimal STORE-only ZIP writer.
 *
 * An .xlsx file is a ZIP of XML parts. Extensions cannot pull JSZip from a CDN
 * (the page CSP and the MV3 remote-code rule both forbid it), so we build the
 * container ourselves. Entries are stored uncompressed; Excel accepts that.
 */
var ZAE_ZIP = (function () {
  'use strict';

  var TABLE = null;
  function crcTable() {
    if (TABLE) return TABLE;
    TABLE = new Uint32Array(256);
    for (var i = 0; i < 256; i++) {
      var c = i;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      TABLE[i] = c >>> 0;
    }
    return TABLE;
  }

  function crc32(u8) {
    var t = crcTable(), c = 0xFFFFFFFF;
    for (var i = 0; i < u8.length; i++) c = t[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  var enc = new TextEncoder();

  /**
   * files: [{ name: 'xl/workbook.xml', text: '<?xml ...' }]
   * returns: Blob
   */
  function build(files) {
    var parts = [];        // local header + data, in order
    var central = [];      // central directory records
    var offset = 0;

    for (var i = 0; i < files.length; i++) {
      var name = enc.encode(files[i].name);
      var data = enc.encode(files[i].text);
      var crc = crc32(data);

      var lh = new Uint8Array(30 + name.length);
      var dv = new DataView(lh.buffer);
      dv.setUint32(0, 0x04034b50, true);   // local file header signature
      dv.setUint16(4, 20, true);           // version needed
      dv.setUint16(6, 0, true);            // flags
      dv.setUint16(8, 0, true);            // method: 0 = store
      dv.setUint16(10, 0, true);           // mod time
      dv.setUint16(12, 0x21, true);        // mod date = 1980-01-01 (deterministic)
      dv.setUint32(14, crc, true);
      dv.setUint32(18, data.length, true); // compressed size
      dv.setUint32(22, data.length, true); // uncompressed size
      dv.setUint16(26, name.length, true);
      dv.setUint16(28, 0, true);           // extra length
      lh.set(name, 30);

      parts.push(lh, data);

      var cd = new Uint8Array(46 + name.length);
      var cv = new DataView(cd.buffer);
      cv.setUint32(0, 0x02014b50, true);   // central directory signature
      cv.setUint16(4, 20, true);           // version made by
      cv.setUint16(6, 20, true);           // version needed
      cv.setUint16(8, 0, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, 0, true);
      cv.setUint16(14, 0x21, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true);
      cv.setUint16(30, 0, true);           // extra
      cv.setUint16(32, 0, true);           // comment
      cv.setUint16(34, 0, true);           // disk number start
      cv.setUint16(36, 0, true);           // internal attrs
      cv.setUint32(38, 0, true);           // external attrs
      cv.setUint32(42, offset, true);      // offset of local header
      cd.set(name, 46);
      central.push(cd);

      offset += lh.length + data.length;
    }

    var cdSize = 0;
    for (var j = 0; j < central.length; j++) cdSize += central[j].length;

    var eocd = new Uint8Array(22);
    var ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);

    return new Blob(parts.concat(central, [eocd]), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  return { build: build, crc32: crc32 };
})();
