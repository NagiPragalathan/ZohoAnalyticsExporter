# Zoho Analytics Exporter

A Chrome extension that adds an **export** button to any Zoho Analytics view.
It auto-scrolls the report until every row has loaded, then downloads the full
dataset as **Excel (.xlsx)** or **CSV** — no Zoho export permission needed, and
no row limit.

Built and verified against
`https://analytics.zoho.eu/open-view/117740000003610471` (`LP_India_Leads_Pivot`,
1,284 rows × 28 columns).

---

## Install

See **[INSTALL.md](INSTALL.md)** — start there.

- **To install it yourself now:** unzip and use **Load unpacked** in
  `chrome://extensions`.
- **To share it with others:** the Chrome Web Store, listed as *Unlisted* —
  recipients get a link and one click, no files and no developer mode. The full
  submission pack is prepared in `store-assets/STORE_LISTING.md`.

Note that no Chrome extension can hide its source: a `.crx` is a signed ZIP that
anyone can rename and read, and the same applies to Web Store packages.

---

## Using it

1. Open your Zoho Analytics view.
2. A small **Zoho Analytics Exporter** panel appears at the bottom right.
   Drag it by its header if it is in the way; the `–` button collapses it.
3. Wait for the panel to say **"Data detected"**.
4. Click **Scroll & extract**. The grid scrolls itself to the bottom while the
   panel reports progress.
5. When it finishes you get a summary like
   `1,284 rows × 28 columns` / `Complete — matches the 1284 rows the view reports.`
6. Click **Download .xlsx** or **Download .csv**.

Files are named after the view, e.g. `LP_India_Leads_Pivot_20260801_1931.xlsx`.

### If the panel says "Waiting for the view to load…"

Reload the page (**F5**). The extension has to be listening *before* Zoho
requests its data, so a tab that was already open when you installed the
extension will not have been captured.

---

## What you get

**Excel (.xlsx)**
- Bold header row, frozen so it stays visible while scrolling
- AutoFilter enabled on every column
- Date columns written as **real Excel datetimes** (`dd/mm/yyyy hh:mm`), not text
- Columns sized to content, capped so one long free-text field cannot push the
  rest off-screen
- Phone numbers and `utm_*` IDs deliberately kept as **text** so a leading `+`
  survives and an 18-digit campaign ID is not rounded to floating point

**CSV**
- UTF-8 **with BOM**, so Excel opens it in the right encoding and non-Latin
  names (Arabic, Turkish, …) and `€` symbols display correctly
- RFC-4180 quoting, CRLF line endings

Zoho's `-No Value-` / `--NULL--` placeholders become genuinely empty cells in
both formats.

---

## How it works

Zoho Analytics renders its grid from a **virtualised DOM** — only the ~40 rows
you can actually see exist as elements at any moment. Scraping the visible table
therefore silently loses rows, which is the trap most "export this table"
extensions fall into.

Instead:

| File | Role |
| --- | --- |
| `src/interceptor.js` | Runs in the page's **MAIN world at `document_start`**, before Zoho's own bundle. Patches `XMLHttpRequest` and `fetch` and forwards any `ZDBTableDataAction` / `AnalysisViewJSON` response to the content script via `postMessage`. |
| `src/parser.js` | Decodes the pivot payload into a flat table (see below). |
| `src/xlsx.js` | Writes SpreadsheetML for a single-sheet workbook. |
| `src/zip.js` | Minimal STORE-only ZIP writer — an `.xlsx` is a ZIP of XML parts, and MV3 forbids pulling JSZip from a CDN. |
| `src/content.js` | The panel, the auto-scroll loop, and the downloads. |

### The pivot payload

Row data arrives as a **collapsed tree**, not a list of rows:

```jsonc
dataTextNew = {
  "0": { "n": {"ov":"1693134535000","fv":"27/08/2023 11:08 AM"},
         "0": { "n": {"ov":"Malik","fv":"Malik"},
                "0": { … 28 levels deep … , "v": [ … column-axis cells … ] } } }
}
```

Each nesting level is one row-dimension column; sibling keys `"0"`, `"1"`, `"2"`
are the distinct values at that level, and repeated values are collapsed. So the
path from the root down to a **leaf** reconstructs one full data row, and the
number of leaves is the true row count. `v` at the leaf holds the column-axis
cells.

The parser derives the column count from the tree's own depth rather than
trusting a header list, then reads names from `PVTColHead` / `colHead`.

### Why the scroll stops when it does

The obvious exit condition — "stop when the grid stops growing" — does **not**
work here. Because Zoho recycles row elements, `scrollHeight` oscillates up and
down forever; in testing it swung between ~10,500 and ~12,500 px indefinitely and
a stability test only fired by luck, after ~110 seconds.

So the extension uses an authoritative signal instead: every response carries the
view's own total row count in `navigInfo`, and scrolling stops the moment the
rows we can parse **equal the rows the view says exist**. Same verified result,
in about 5 seconds. Views that genuinely paginate keep scrolling until their
later pages arrive; the `scrollHeight` test is retained only as a fallback for
payload shapes the parser does not recognise.

---

## Supported views

Pivot-style views are fully supported and verified.

Other view types (plain tables, charts, dashboards) may use a different payload
shape. If extraction fails the panel says so plainly rather than handing you a
partial file, and **Save raw JSON response** dumps the underlying response so the
format can be added.

The panel never reports success on a partial extraction — if the parsed row count
does not match the view's own count, it shows a **WARNING** telling you to scroll
again or reload.

---

## Sites covered

`analytics.zoho.` + `com`, `eu`, `in`, `com.au`, `com.cn`, `jp`, `ca`, `uk`,
`sa`, plus `analytics.zohocloud.ca`. Add more under `content_scripts.matches` in
`manifest.json` if your data centre is missing.

---

## Permissions & privacy

The manifest requests **no** `permissions` block at all — no `storage`, no
`downloads`, no `tabs`. It only asks to run content scripts on Zoho Analytics
hosts.

Everything happens locally in your browser. Nothing is uploaded anywhere, and
files are produced with `URL.createObjectURL`, which is why no download
permission is needed.

One thing to be aware of: the MAIN-world interceptor talks to the content script
over `window.postMessage`, so in principle the page itself could post a
lookalike message. The worst case is that the extension parses data the page
supplied — it cannot escalate beyond the panel — but it is the reason the
extension is scoped to Zoho hosts only.

---

## Known limitations

- **A tab open before install must be reloaded.** The interceptor has to be in
  place before Zoho requests its data.
- **A column axis with no measure produces empty columns.** In the reference
  view, `LP Lead Status` is on the pivot's column axis with no measure
  configured, so all ten of its columns are blank for every row. The extension
  detects this, omits them, and says so in the panel. If you need lead status
  per row, add a measure to the pivot or filter the view one status at a time.
- **Only pivot payloads are parsed** (see *Supported views*).

---

## Development notes

There is no build step — the files in `src/` ship as-is.

To automate a browser with this extension loaded, note that **Chrome 137+
ignores `--load-extension`**, and by Chrome 150 the
`--disable-features=DisableLoadExtensionCommandLineSwitch` workaround no longer
helps either. Use a plain Chromium build (for example the one Playwright
bundles) for automated testing; the extension itself installs and runs fine in
normal Chrome via **Load unpacked**.
