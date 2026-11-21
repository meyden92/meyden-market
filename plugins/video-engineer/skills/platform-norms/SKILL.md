---
name: platform-norms
description: "Platform norms for video-engineer per platform (YouTube, YouTube Shorts, Instagram Reels, TikTok, LinkedIn): aspect and canvas, duration band, safe zones in px for 1080x1920 and 1920x1080, minimum caption size, hook timing, each value with its source. Use when recommending format, length, safe zones, caption size or hook timing in the interview, or when placing text and captions for a platform cut."
user-invocable: false
---
<!-- upstream: DojoCodingLabs/remotion-superpowers commands/create-short.md @ 48c2cfc93a1a58fca75d80bc2205353faed3f23f (MIT) -->

# Platform norms

Safe zones are margins in px from each canvas edge where platform UI (captions, buttons, username, progress bar) covers the video. Keep text, faces and key UI inside them; backgrounds may run to the edge. When one cut serves several platforms, use the largest margin per edge across them.

Source tags: **[official]** fetched from the platform's own page; **[dojo]** vendored from the upstream file in the header; **[2nd]** secondary source, not confirmed by the platform; **[judgement]** no source found, a working default. Prefer the platform's own tool (Meta Ads Manager safe-zone overlay, the TikTok safe-zone template) when the user can check one.

## YouTube

| Norm | Value | Source |
|---|---|---|
| Canvas | 16:9, 1920x1080 | [official] 1 |
| Duration band | no fixed band; at least 25 s when an end screen is wanted | [official] 2 |
| Safe zone 1920x1080 | 96 px left and right, 54 px top and bottom (5 % title-safe) | [judgement] |
| End screen | occupies the last 5-20 s; keep that span free of key content or end on the CTA scene before it | [official] 2 |
| Safe zone 1080x1920 | n/a (use YouTube Shorts) | |
| Caption min | 36 px at 1920x1080 | [judgement] |
| Hook | promise stated within the first 15 s | [judgement] |

## YouTube Shorts

| Norm | Value | Source |
|---|---|---|
| Canvas | 9:16, 1080x1920, 30 fps | [official] 3 (vertical, up to 1080p); [dojo] |
| Duration band | up to 3 min; 15-60 s works best, sweet spot 30 s | [official] 3; [dojo] |
| Safe zone 1080x1920 | text in the center 60 %: 216 px left and right, 384 px top and bottom | [dojo] |
| Caption min | 56 px bold (56-72 px with shadow); body text 48-64 px; titles 72-96 px | [dojo] |
| Hook | first 2-3 s; scenes 2-5 s; loop-friendly ending with CTA | [dojo] |

## Instagram Reels

| Norm | Value | Source |
|---|---|---|
| Canvas | 9:16, 1080x1920, 30 fps | [dojo] |
| Duration band | 15-60 s, sweet spot 30 s | [dojo] |
| Safe zone 1080x1920 | top 270 px (14 %), bottom 670 px (35 %), left and right 65 px (6 %) | [2nd] 4 |
| Caption min | 56 px bold | [dojo] |
| Hook | first 2-3 s | [dojo] |

## TikTok

| Norm | Value | Source |
|---|---|---|
| Canvas | 9:16 recommended, at least 540x960; render 1080x1920, 30 fps | [official] 5; [dojo] |
| Duration band | up to 10 min for ads; 15-60 s works best, sweet spot 30 s | [official] 5; [dojo] |
| Safe zone 1080x1920 | top 240 px, bottom 660 px, left 120 px, right 120 px plus a 180 px button column on the right from 840 px down | [2nd] 6 |
| Caption min | 56 px bold; TikTok's own ad captions are a fixed white font, up to 4 lines in Spark Ads, so burned-in captions sit above the bottom margin | [dojo]; [official] 5 |
| Hook | first 2-3 s | [dojo] |

## LinkedIn

| Norm | Value | Source |
|---|---|---|
| Canvas | 16:9, 1:1, 4:5 or 9:16; 1920x1080 for a wide cut, 1080x1080 for the square cut | [2nd] 7 |
| Duration band | 3 s to 30 min; 15-30 s recommended for feed ads | [2nd] 7 |
| Safe zone 1920x1080 | 96 px left and right, 54 px top and bottom | [judgement] |
| Safe zone 1080x1920 | as YouTube Shorts: 216 px sides, 384 px top and bottom | [judgement] |
| Caption min | 36 px at 1920x1080, 56 px at 1080x1920; captions on, feed video autoplays muted | [judgement] |
| Hook | first 3 s | [judgement] |

## Sources

1. YouTube recommended upload encoding settings: https://support.google.com/youtube/answer/1722171
2. YouTube end screens: https://support.google.com/youtube/answer/6388789
3. YouTube Shorts upload: https://support.google.com/youtube/answer/10059070
4. Meta Reels ad safe zone (secondary): https://moda.app/resources/sizes/meta-reels-ad
5. TikTok video ads specifications: https://ads.tiktok.com/help/article/video-ads-specifications
6. TikTok safe zone, scaled from the 720x1280 template (secondary): https://www.socialync.io/tools/safe-zones/tiktok
7. LinkedIn video specs (secondary): https://shootsta.com/blog/linkedin-video-ad-specs-and-formats-2026

Values fetched 2026-10-20.

Done when: every format, safe-zone, caption-size and hook recommendation names its row here and that row's source tag.
