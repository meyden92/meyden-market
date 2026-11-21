---
name: reference-analysis
description: "How video-engineer reads reference screenshots into videos/<slug>/research/references.md: one fixed-schema block per screenshot (layout, palette as hex, type weight, information density, implied motion, platform UI visible, take / reject) plus a summary. Use when analysing reference images for a video, or when reading references.md during the interview."
user-invocable: false
---

# Reference analysis

Each reference screenshot gets one block in `videos/<slug>/research/references.md`. Describe what is visible; the interview turns it into decisions. The take and reject lines are proposals the interview confirms with the user.

## Reading a screenshot

Open each image with the Read tool and look at it at full size. For every field, write what you see, not what the image is probably about. Give sizes and positions at full canvas scale (1080x1920, 1920x1080 or 1080x1080) even when the image file is smaller.

- **Layout**: canvas orientation and estimated aspect (9:16, 16:9, 1:1, 4:5); where the main element sits (thirds, centered, split); margins; how many distinct elements.
- **Palette**: three to six hex colors, background first, then the main foreground, then accents. Estimate from the pixels; write `#RRGGBB`. Mark an accent that covers under 5 % of the frame as `(accent)`.
- **Type**: serif, sans or mono; weight (regular, semibold, bold, black); case; the largest text as a share of frame height (for example "headline about 6 % of height, about 115 px at 1920 tall"); whether text has a background box, outline or shadow.
- **Density**: low (one idea, lots of empty space), medium (two or three grouped elements) or high (dashboard, many labels); the number of words visible.
- **Implied motion**: what this frame suggests moves and how: typing cursor, highlight bar mid-sweep, half-revealed list, motion blur, zoomed-in crop. Write "none visible" when the frame is static.
- **Platform UI visible**: app chrome in the capture (TikTok sidebar, Reels caption bar, YouTube progress bar, browser frame) and where it sits. This tells which platform the reference was cut for and where its safe zone was. Platform UI is never a Take; it is the platform's, not the video's.
- **Take**: the craft to copy into this video (one to three items): layout logic, density, timing, finish. A reference shows craft, not a style to copy; the look is the user's choice.
- **Reject**: what not to copy and why (one to three items). Watch for neon, glow, stock footage, talking heads and dense text walls; these conflict with the plugin's motion rules or are out of scope.

## File format

```markdown
# References: <slug>

## <file name>
- Layout: 9:16; headline in the upper third, terminal card centered, 64 px side margins; 3 elements
- Palette: #0B1020 (bg), #E6EDF3, #7EE787 (accent), #79C0FF
- Type: sans bold headline about 5 % of height (96 px at 1920 tall), mono regular in the card; no shadow
- Density: medium; 14 words visible
- Implied motion: typing cursor at the end of the command line; output lines appear one by one
- Platform UI visible: none
- Take: dark terminal card as the main visual; one green accent for success states
- Reject: the 20 px footer text (under the caption minimum)

## Summary
- Shared palette: <hex list that recurs>
- Shared type: <family class and weights>
- Density: <the common level>
- Motion feel: <one line>
- Aspect: <the common aspect, and which platform the UI suggests>
- Conflicts between references: <list, or none>
```

Every field line is present in every block, even when its value is "none visible". The summary lists only what two or more references share, plus the conflicts.

Done when: references.md has one block per screenshot with all eight field lines, every palette entry is a `#RRGGBB` hex, and the summary is present.
