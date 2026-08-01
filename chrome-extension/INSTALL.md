# Installing the Zoho Analytics Exporter

## Which method do you want?

| You want… | Use |
| --- | --- |
| To send someone a link they just click | **[Chrome Web Store](#method-2--chrome-web-store-best-for-sharing)** — being submitted |
| To install it yourself, right now | **[Load unpacked](#method-1--load-unpacked-works-today)** |
| To deploy it across a whole team | **[Enterprise policy](#method-3--enterprise-policy-silent-permanent-install)** |

## About dragging a `.crx` in

A `.crx` you can drag onto `chrome://extensions` sounds like the obvious answer,
but it does not work. Chrome deliberately blocks installing a `.crx` from
anywhere except the Web Store, and gives you:

> Apps, extensions and user scripts cannot be added from this website

or, in the error log, `CRX_REQUIRED_PROOF_MISSING`. That is intentional, it
applies on Windows and macOS, and it has been that way for years. Any guide
telling you to drag a `.crx` in is out of date.

There is also no way to distribute a Chrome extension without exposing its
source: a `.crx` is just a signed ZIP, and anyone can rename it and read every
file. The same is true of Web Store extensions. The Web Store is the closest
thing to a "just install it" file — the recipient never sees or handles code.

---

## Method 1 — Load unpacked (works today)

1. **Get the folder.**
   Either use `chrome-extension\` directly, or unzip
   `dist\zoho-analytics-exporter-1.0.0.zip` somewhere permanent.

   > Put it somewhere it will not be deleted — Chrome loads it from this path
   > every time it starts. `Documents\ChromeExtensions\` is a good spot.
   > Do **not** leave it in Downloads or a temp folder.

2. Open Chrome and go to **`chrome://extensions`**
   (or ⋮ menu → **Extensions** → **Manage Extensions**).

3. Turn on **Developer mode** — the toggle at the **top right**.

4. Click **Load unpacked** (top left).

5. Select the folder that **contains `manifest.json`** — that is the
   `chrome-extension` folder itself, not its parent and not `src`.

6. "Zoho Analytics Exporter 1.0.0" appears in the list. Done.

7. Open your Zoho Analytics view and **reload the page (F5)**.
   The panel appears at the bottom right.

### Confirming it works

Open <https://analytics.zoho.eu/open-view/117740000003610471>. Within a few
seconds the panel should read **"Data detected · 1,284 rows"**. Click
**Scroll & extract**, then **Download .xlsx**.

### Notes

- Chrome will show *"Disable developer mode extensions"* warnings on startup.
  That is normal for any unpacked extension. Click the **X** to dismiss; do not
  click "Disable".
- Chrome may deactivate the extension after an update. If the panel stops
  appearing, revisit `chrome://extensions` and click the refresh (↻) icon on its
  card.
- **Do not delete or move the folder** afterwards — Chrome loads it from that
  path on every launch.

---

## Method 2 — Chrome Web Store (best for sharing)

The only route where the recipient never touches a file or a folder: you send a
link, they click **Add to Chrome**, done. No ZIP, no developer mode, no warning
banners, and updates arrive automatically.

Listed as **Unlisted**, it will not appear in store search — only people with
the link can find it.

Everything needed is prepared in **`store-assets\STORE_LISTING.md`**: the
listing copy, permission justifications, privacy answers, and 1280×800
screenshots. You supply the account; the package to upload is
`dist\zoho-analytics-exporter-1.0.0.zip`.

Cost is a one-time US$5 developer registration. Review usually takes a few days.

> Upload the **ZIP**, not a `.crx`. Google generates and holds the signing key
> itself, which is why no local `.pem` is kept — for Web Store distribution it
> serves no purpose.

---

## Method 3 — Enterprise policy (silent, permanent install)

The supported route for installing an unpublished extension without developer
mode — appropriate if you want this deployed across the team. Requires local
admin rights.

Note this route needs a **self-signed `.crx` and its `.pem` key**, which are not
currently kept (the Web Store route makes them unnecessary). Repack with
`chrome.exe --pack-extension=<folder>` if you go this way, and keep the
generated `.pem` private — it is what lets you ship updates under the same
extension ID.

1. Host the `.crx` and a small update XML on a path or URL every machine can
   reach.
2. Add the extension ID to the
   `ExtensionInstallForcelist` (or `ExtensionInstallAllowlist`) policy under
   `HKLM\SOFTWARE\Policies\Google\Chrome`.
3. The extension installs on next launch and cannot be turned off by the user.

Chrome's own reference:
<https://chromeenterprise.google/policies/#ExtensionInstallForcelist>

---

---

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| "Manifest file is missing or unreadable" | You selected the wrong folder. Pick the one **containing `manifest.json`**. |
| No panel on the page | Reload the page (F5). The extension must be listening before Zoho fetches its data. |
| Panel stuck on "Waiting for the view to load…" | Same fix — reload. If it persists, your data centre may not be in `matches`; add it in `manifest.json` and reload the extension. |
| Panel says "Could not extract" | The view is probably not a pivot type. Click **Save raw JSON response** so the payload shape can be added. |
| Row count warning after extracting | Extraction was incomplete. Reload the page and run **Scroll & extract** again. |
| Extension vanished after restart | The folder was moved or deleted. Re-add it via **Load unpacked** from a permanent location. |
| Downloads blocked | Chrome may prompt on the first multi-file download from a site. Choose **Allow**. |

---

## Uninstalling

`chrome://extensions` → **Remove** on the extension's card. Nothing is left
behind — the extension stores no data.
