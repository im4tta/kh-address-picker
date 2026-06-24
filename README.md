# KH Address Picker

🇰🇭 A Tampermonkey/Violentmonkey userscript that adds a floating bilingual
(Khmer/English) Cambodia address picker — province → district → commune →
village, with search — to any page.

## How it's structured

```
kh-address-picker/
├── kh-address-picker.user.js   ← the userscript you publish (GitHub + Greasyfork)
├── data/
│   └── tree-data.json          ← generated data file, fetched at runtime
├── scripts/
│   └── build-data.js           ← regenerates tree-data.json from your CSV
└── README.md
```

**Why fetch instead of embed?** Embedding ~14,500 villages directly in the
script (your original "self-contained" version) makes a multi-megabyte file.
That's fine for a local/offline build, but it's a poor fit for Greasyfork:
big files are slow to review/update and every data correction means
re-publishing the whole script. Instead, `kh-address-picker.user.js` stays
small and pulls `data/tree-data.json` from your GitHub repo's raw URL. It's
cached locally (`GM_setValue`) so it only re-fetches once a day, and the
picker only loads data the first time someone actually opens the panel —
not on every page load, even though `@match` is `*://*/*`.

If you still want a fully offline build (no network calls at all, for use
inside something like a browser extension or an air-gapped environment),
keep using your original self-contained template with the `%TREE_DATA%`
placeholder — just substitute it with the output of `build-data.js` at
build time instead of typing it by hand.

## 1. Regenerate the data file from your CSV

```bash
# First, check your CSV's actual column headers:
node scripts/build-data.js path/to/Cambodia_Geographical_List_2025.csv --list-headers

# Edit COLUMN_MAP at the top of scripts/build-data.js so each key
# points at the matching header name in your file, then:
node scripts/build-data.js path/to/Cambodia_Geographical_List_2025.csv > data/tree-data.json
```

The script has no dependencies (`node build-data.js` works as-is), handles
quoted CSV fields (commas/newlines inside quotes), dedupes by code at each
level, and will refuse to run with a clear error if `COLUMN_MAP` doesn't
match your file's headers.

`data/tree-data.json` looks like:

```json
{
  "version": "2026-06-24",
  "generatedFrom": "Cambodia_Geographical_List_2025.csv",
  "provinceCount": 25,
  "villageCount": 14583,
  "provinces": [ { "code": "...", "kh": "...", "en": "...", "districts": [...] } ]
}
```

## 2. Push to GitHub

```bash
git init
git add .
git commit -m "KH Address Picker v1.1.0"
git remote add origin https://github.com/im4tta/kh-address-picker.git
git push -u origin main
```

Make sure `data/tree-data.json` actually lands at the path the script
expects — by default:

```
https://raw.githubusercontent.com/im4tta/kh-address-picker/main/data/tree-data.json
```

If your repo name, branch, or path differs, update the `DATA_URL` constant
near the top of `kh-address-picker.user.js` before publishing.

Whenever you regenerate `tree-data.json` (fixed a village name, added a new
record, etc.) just commit and push — users get the update automatically
within 24 hours (or immediately on next install), **without** needing to
update the script itself.

## 3. Publish on Greasyfork

1. Go to https://greasyfork.org/scripts/new
2. Choose "Link to an external script" and paste the **raw** GitHub URL:
   `https://raw.githubusercontent.com/im4tta/kh-address-picker/main/kh-address-picker.user.js`
   (or paste the file contents directly — either works)
3. Greasyfork reads the `==UserScript==` metadata block automatically.
4. Bump `@version` in the script header every time you change the
   **script's code** (not needed for data-only updates, since those are
   fetched live).
5. Keep `@connect raw.githubusercontent.com` in the header — Greasyfork
   requires every external domain a script talks to (via
   `GM_xmlhttpRequest`) to be declared there, or the script will fail
   review.

## Notes on the script itself

- `@match *://*/*` means the floating button shows on every site. Data is
  only fetched the first time a user actually clicks it open, so there's
  no background network traffic on pages where the picker is never used.
- Falls back to the last cached copy if a fetch fails, and shows a
  "Retry" button in the panel if there's no cache yet and the fetch fails
  (e.g. offline, GitHub unreachable).
- All UI/search/copy logic is unchanged from your original self-contained
  version — same selects, same search index, same copy-to-clipboard
  behavior — only the data-loading layer changed.
