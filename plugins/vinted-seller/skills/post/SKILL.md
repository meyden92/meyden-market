---
name: post
description: Fills the vinted.de upload form in the browser from a listing file written by /vinted-seller:listing, for you to review and publish.
disable-model-invocation: true
argument-hint: "[listing file or folder]"
---

# Fill the Vinted upload form

Input: `$ARGUMENTS`, a listing file (`listing.md` or `listing-<slug>.md`) or the folder holding them. Nothing given: look in the working directory. A folder with several listing files: ask which ones to post, then run the steps below once per listing, each in a fresh form, handing over after each before starting the next.

You fill the form; the user publishes. The listing goes live under their account, so the click on **Hochladen** stays with them.

## 1. Open the form

Use the built-in browser (`mcp__Claude_Browser__*`) unless the user asked for Chrome. Navigate to `https://www.vinted.de/items/new`.

- A sign-in page appears: ask the user to sign in in that browser themselves, and continue once they say they are in. Credentials are theirs to type.
- A cookie banner appears: choose the option that declines non-essential cookies.

## 2. Photos

Upload the files in the order of the `Fotos:` line.

- The browser offers a file-upload tool (Claude in Chrome does): use it.
- It has none (the built-in browser): list the absolute photo paths, ask the user to drag them into the photo area, and continue once they confirm.

## 3. Fields

Fill in form order: Titel, Beschreibung (with the hashtags), Kategorie, Marke, Größe, Zustand, Farbe, Material, Preis, Paketgröße. Locate fields with `find` or `read_page`, and type into text fields with `form_input`.

- **Kategorie**: click through the tree to the listing's path. Where the tree's names differ, take the closest branch and note the difference.
- **Marke**: type the brand and pick the matching suggestion. No match: ask the user.
- **Größe, Zustand, Farbe, Material, Paketgröße**: pick the option that matches the listing file. Material empty (`—`): skip it.

Take a screenshot after each dropdown choice to confirm it took.

## 4. Check

Read the filled form with `get_page_text` and a screenshot, and compare every field with the listing file.

**Done when** every field matches the listing file or each difference is listed.

## 5. Hand over

Tell the user the form is filled, list any differences (category branch, brand spelling, skipped photos), and that pressing **Hochladen** publishes it. Leave the tab open on the filled form.
