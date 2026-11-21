# vinted-seller

Turns item photos into German Vinted listings, prices them against comparable listings on vinted.de, and fills the upload form in the browser for you to publish.

## Install

```bash
claude plugin install vinted-seller@meyden
```

## What it provides

| Component | What it does |
| :-- | :-- |
| `/vinted-seller:listing [photos]` | Reads the photos, sorts a folder of mixed photos into items and confirms the grouping with you (separate listings, bundles, photos to leave out), asks for what the photos don't show, and writes one listing file per item next to them (`listing.md`, or `listing-<slug>.md` when there are several): title, description with hashtags, category, brand, size, condition, colours, material, parcel size and price. Also fires on its own when you ask to sell something on Vinted. |
| `/vinted-seller:post [listing file or folder]` | Optional. Opens `vinted.de/items/new` in the browser and fills the form from a listing file, one listing at a time. You sign in and press **Hochladen** yourself. Without it, you copy the fields from the listing file into the Vinted app or website. |
| `vinted-seller:pricer` agent | Reads comparable vinted.de listings and returns a price range with example links. `listing` dispatches one per item. |

## Requirements

None for writing listings. Prices are most reliable when a browser Claude Code can drive is available (the built-in browser in the Claude desktop app, or Claude in Chrome); without one, `pricer` falls back to web search.

Only for `/vinted-seller:post`:

- one of those browsers, with your vinted.de account signed in by you
- Claude in Chrome for automatic photo upload; in the built-in browser, `post` lists the photo paths and you drag them in
