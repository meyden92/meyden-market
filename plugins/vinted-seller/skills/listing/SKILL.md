---
name: listing
description: Writes German Vinted listings (vinted.de) from photos of items to sell, sorting a folder of mixed photos into one listing per item, and covering title, description, category, brand, size, condition, colours, material, parcel size and a price checked against comparable listings. Use whenever the user wants to sell clothes, shoes, accessories or other second-hand items on Vinted, shares photos of something to sell, or asks what to write or charge for it, even if they don't say "Vinted".
when_to_use: 'Examples: "sell this on Vinted", "write a listing for these photos", "what can I ask for this jacket", "Anzeige für die Jacke schreiben", "was kann ich dafür verlangen", "das will ich inserieren".'
argument-hint: "[photo files or folder]"
---

# Vinted listing

Input: `$ARGUMENTS`, photos as files or a folder. They may show one item or several. Nothing given: ask for them.

The listing is written in German for vinted.de. A fact goes into it only when a photo shows it or the user said it.

## 1. Read and group the photos

Read every photo and group them by item: the same piece across shots (colour, pattern, labels, details) is one group. A photo that fits no group, or fits two, is unsure. Per item, note item type, brand (label, logo), size (size tag), material (care label), colours, and every flaw: stains, holes, pilling, fading, missing buttons, scuffed soles.

One group and no unsure photo: continue. Otherwise show the proposed groups (short item name → file names) and confirm them with AskUserQuestion:

- the grouping as proposed, or which groups to merge or split
- where each unsure photo belongs, or that it is left out
- which items to list on their own, sell together as one bundle listing, or skip

**Done when** every photo belongs to exactly one listing or is left out, and the user confirmed the grouping whenever there is more than one item.

## 2. Close the gaps

Ask for each field the photos leave open: brand, size, condition, flaws the photos can't show (smell, broken zip), and measurements when the size alone misleads (vintage, kids, no tag). Material is optional on Vinted; leave it `—` when nobody knows it. Batch the questions for all listings into as few AskUserQuestion rounds as possible, each question naming its item.

**Done when** every field except Material has a value from a photo or from the user.

## 3. Price

Dispatch one `vinted-seller:pricer` agent per listing, all in one message, each with item type, brand, model or line, size, condition and colour. Set Preis inside the range it returns: upper half for Neu mit Etikett, Neu ohne Etikett and Sehr gut, lower half for Gut and Zufriedenstellend or any named flaw. When it found fewer than 5 comparables, tell the user the price is an estimate.

## 4. Write the listing files

Write into the photos' folder (the folder argument, or the folder of the first photo), leaving the photos where they are:

- one listing: `listing.md`
- several: one `listing-<slug>.md` each, the slug in kebab-case from brand and item type (`listing-levis-501-jeans.md`)

```markdown
# <Titel>

- Kategorie: <path, e.g. Herren > Kleidung > Jeans > Gerade Jeans>
- Marke: <brand>
- Größe: <size as Vinted lists it, e.g. W32 L32, M, 42>
- Zustand: <one of the five values below>
- Farbe: <one or two colours>
- Material: <material or —>
- Paketgröße: <Klein | Mittel | Groß>
- Preis: <n> €
- Fotos: <this listing's file names in upload order, overview shot first>

## Beschreibung

<text>

## Preisrecherche

<range, number of comparables, three comparable links from the pricer>
```

Field rules:

- **Titel**: brand, item type, defining feature, size, e.g. `Levi's 501 Jeans dunkelblau W32 L32`. Plain words in normal case.
- **Beschreibung**: informal German (du), as Vinted sellers write. One or two sentences on what it is, then the condition with every flaw named, then measurements if known, then 3–5 hashtags buyers search for (`#levis #jeans #501`). Smoke-free or pet-free household only when the user says so.
- **Kategorie**: Vinted's category tree, as deep as it goes. It is a best guess here; `/vinted-seller:post` matches it against the real form.
- **Zustand**, exactly one of:
  - `Neu mit Etikett`: never worn, tags attached
  - `Neu ohne Etikett`: never worn, no tags
  - `Sehr gut`: worn a few times, no visible flaws
  - `Gut`: worn, light signs of wear
  - `Zufriedenstellend`: visible flaws, all named in the description
- **Paketgröße**: Klein for shirts, tops and small accessories; Mittel for jeans, knitwear and shoes; Groß for coats, boots and bundles.

## 5. Hand over

Show each listing in chat and apply the user's changes to its file. The listing files are the finished product: the user copies their fields into the Vinted app or website. Mention once that `/vinted-seller:post <listing file>` can fill the upload form in the browser instead, if they want that.

**Done when** there is one listing file per confirmed listing, every field holds a value (Material may be `—`), and each Preis comes from its pricer's range.
