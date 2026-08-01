# Chrome Web Store submission pack

Everything below is ready to paste into the developer dashboard. You only need
to create the account and upload — no writing required.

- **Upload this package:** `dist\zoho-analytics-exporter-1.0.0.zip`
- **Dashboard:** <https://chrome.google.com/webstore/devconsole>
- **One-time registration fee:** US$5

> Upload the **ZIP**, not the `.crx`. Google generates and holds the signing key
> itself, which is why the local `.pem` was deleted — for Web Store distribution
> it serves no purpose.

---

## 1. Store listing tab

### Name (max 75)
```
Zoho Analytics Exporter
```

### Summary (max 132)
```
Export any Zoho Analytics view to Excel or CSV. Auto-scrolls to load every row — no export permission, no row limit.
```
*(118 characters)*

### Description (max 16,000)
```
Zoho Analytics Exporter adds a one-click export button to any Zoho Analytics view.

It scrolls the report until every row has loaded, then downloads the complete dataset as Excel (.xlsx) or CSV — no export permission needed on your Zoho account, and no row limit.

HOW TO USE

1. Open your Zoho Analytics view.
2. A small panel appears at the bottom right. Drag it by its header if it is in the way.
3. Wait for it to say "Data detected".
4. Click "Scroll & extract" and watch the progress.
5. Click "Download .xlsx" or "Download .csv".

Files are named after the view, for example LP_India_Leads_Pivot_20260801_1931.xlsx.

WHY IT GETS EVERY ROW

Zoho Analytics renders its grid from a virtualised DOM — only the few dozen rows you can actually see exist on the page at any moment. Tools that scrape the visible table silently lose rows.

This extension reads the report's own data response instead, so the export is complete by construction. It then verifies the result: every response carries the view's total row count, and the panel only reports success when the extracted rows match that number exactly. If they do not, you get a warning instead of a quietly incomplete file.

WHAT YOU GET

Excel (.xlsx)
• Bold header row, frozen so it stays visible while scrolling
• AutoFilter enabled on every column
• Dates written as real Excel datetimes, not text
• Columns sized to content
• Phone numbers and utm_ IDs kept as text, so a leading "+" survives and long campaign IDs are not rounded

CSV
• UTF-8 with BOM, so Excel opens it in the right encoding
• Non-Latin names (Arabic, Turkish, and others) and currency symbols display correctly
• RFC-4180 quoting

Zoho's "-No Value-" placeholders become genuinely empty cells in both formats.

PRIVACY

Everything happens locally in your browser. No data is uploaded, transmitted, or collected — the extension has no server and makes no network requests of its own. It requests no Chrome permissions at all beyond running on Zoho Analytics pages.

SUPPORTED SITES

analytics.zoho.com, .eu, .in, .com.au, .com.cn, .jp, .ca, .uk, .sa, and analytics.zohocloud.ca.

KNOWN LIMITATIONS

• A tab that was already open when you installed the extension must be reloaded, because the extension has to be listening before Zoho requests its data.
• Pivot-style views are fully supported. Other view types may use a different data format; if extraction is not possible the panel tells you plainly rather than producing a partial file.
• If a pivot has a column axis with no measure configured, those columns are empty for every row. The extension detects this, omits them, and explains why.
```

### Category
```
Workflow & Planning
```

### Language
```
English
```

---

## 2. Graphics tab

| Asset | File | Size |
| --- | --- | --- |
| Store icon | `chrome-extension\icons\icon128.png` | 128×128 ✔ |
| Screenshot 1 | `store-assets\screenshots\01-detected.png` | 1280×800 ✔ |
| Screenshot 2 | `store-assets\screenshots\02-scrolling.png` | 1280×800 ✔ |
| Screenshot 3 | `store-assets\screenshots\03-complete.png` | 1280×800 ✔ |
| Small promo tile | `store-assets\promo-small-440x280.png` | 440×280 ✔ |
| Marquee promo tile | `store-assets\promo-marquee-1400x560.png` | 1400×560 ✔ |

> **The screenshots use synthetic data.** The live report contains real leads,
> and store listings are publicly viewable even when unlisted — so every name,
> phone number and email address was replaced with fabricated values before
> capture. Row counts, dates, layout and the panel are genuine. If you ever
> re-shoot these, do the same; never publish a screenshot of the real report.

Suggested screenshot captions:

1. *Open any view — the exporter detects the data automatically*
2. *One click loads every row, however large the report*
3. *Verified complete, then download as Excel or CSV*

---

## 3. Privacy tab

### Single purpose description
```
Exports the data from a Zoho Analytics report view to an Excel or CSV file that the user downloads to their own computer.
```

### Permission justifications

**Host permission — `https://analytics.zoho.*/*`**
```
The extension's only function is exporting Zoho Analytics reports, so it must run on Zoho Analytics pages to read the report the user is currently viewing and to display its export panel. The host list is limited to Zoho Analytics data-centre domains; the extension does not run on any other site. No other Chrome permissions are requested.
```

> The extension declares **no** `permissions` block — no storage, no downloads,
> no tabs. Downloads use `URL.createObjectURL`, which needs no permission. If
> the dashboard asks about a permission not listed here, something has changed
> in the manifest — check before answering.

### Data usage — tick these

- [x] I do **not** sell or transfer user data to third parties
- [x] I do **not** use or transfer user data for purposes unrelated to the single purpose
- [x] I do **not** use or transfer user data to determine creditworthiness or for lending

Every data-collection checkbox should be left **unticked**: the extension
collects nothing, stores nothing, and transmits nothing.

### Privacy policy URL

Required by the dashboard. Publish `store-assets\PRIVACY.md` at a public URL and
paste it here. Quickest options:

- A public **GitHub Gist** — paste the file, save, use the gist URL
- **GitHub Pages** on any repo
- Any page on your company site

---

## 4. Distribution tab

| Setting | Value |
| --- | --- |
| Visibility | **Unlisted** — not searchable; anyone with the link can install |
| Regions | All |
| Pricing | Free |

Choose **Private** instead if you want to restrict it to named Google accounts
in your Workspace domain.

---

## After submitting

Review typically takes a few days. Once approved you get a link like
`https://chromewebstore.google.com/detail/<id>` — send that to anyone who needs
the extension. They click **Add to Chrome** and they are done: no ZIP, no
developer mode, no warnings, and they receive updates automatically whenever you
upload a new version.

To ship an update later: bump `"version"` in `manifest.json`, re-zip the
`chrome-extension` folder, and upload it as a new package under the same item.
