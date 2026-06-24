# KH Address Picker — 🇰🇭

A lightweight userscript that adds a floating Cambodia address picker to any webpage. Pick province → district → commune → village in Khmer and English, search across all levels, and copy with one click.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/)
2. Install directly from the [raw GitHub source](https://raw.githubusercontent.com/im4tta/kh-address-picker/main/kh-address-picker.user.js) — your userscript manager will pick it up automatically
3. Click the 🇰🇭 button floating at the bottom-right of any page to open the picker

## Features

- Four cascading dropdowns: Province → District → Commune → Village
- Search across all levels in Khmer or English
- Bilingual display with administrative codes
- Copy individual entries or the full address
- Remembers your last selection
- Works offline once data is cached (24h refresh)

## Data

The script fetches the latest administrative divisions from GitHub and caches them locally. Data updates automatically — no script update needed. Currently covers **25 provinces** (all of Cambodia).

## Development

| File | What it is |
|------|-----------|
| `kh-address-picker.user.js` | The userscript |
| `data/tree-data.json` | Address data (auto-generated) |
| `build-data.js` | Generates `tree-data.json` from the source CSV |

To rebuild the data: `node build-data.js "Cambodia Geographical List 2025.csv" > data/tree-data.json`

## License

MIT
