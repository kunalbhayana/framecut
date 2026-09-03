# Framecut

A single HTML page for answering *"can you move that photo up a bit?"* without guessing.

You drag a box over the part of an image that should stay visible. Framecut hands
back the exact numbers — either a CSS `object-position`, or a pixel crop rectangle —
and warns you when the crop is about to look bad.

No build step, no dependencies, no install. Open `index.html`.

---

## The problem it solves

Someone says an image looks wrong in its container. You try a value, reload, try
another. Meanwhile nobody knows how much of the photo is actually being cut, or
whether the file is even big enough for the slot it sits in.

Framecut makes all three visible at once: what you'll see, what gets cut, and
whether it will be sharp.

---

## Three ways to use it

**1. Drop files in** — the zero-setup path. Open `index.html` in a browser, drag
images onto the page (or pick a whole folder). Works straight off the filesystem.

**2. Point it at a manifest** — for a project you return to. Generate a list of
every image once:

```bash
./make-manifest.sh path/to/images > images.json
```

Then set `CONFIG.base` in `framecut.js` to the folder those paths are relative to.

**3. Let it read your site** — the most useful mode. Set `CONFIG.scanPage` to a
same-origin page and Framecut opens it in a hidden frame, measures where every
image actually sits, and gives advice about the *real* containers:

```js
const CONFIG = {
  manifest: './images.json',
  scanPage: '../my-site/index.html',
  base: '../my-site/',
  scanClickSelectors: ['button[role="tab"]', '[data-tab]', '.tab'],
};
```

`scanClickSelectors` are things worth clicking so images inside tabs and panels
get measured too.

Without a scan you can still type a container size into the **Slot** boxes and get
the same advice.

---

## What it gives you

**At 100% zoom, no rotation** — a reframe. The file is untouched:

```
hero.jpg — shape 4:3, show 50% across, 26% down

CSS: aspect-ratio: 4 / 3; object-fit: cover; object-position: 50% 26%;
```

**Zoomed or rotated** — a real crop, as pixels, because at that point CSS would
just be enlarging pixels:

```
hero.jpg — shape 4:3, rotated 1°, zoomed 150%, show 50% across, 50% down

Rotate the file by 1°, then crop to 820 x 615 px, starting 397 px from the left
and 154 px from the top.
(after rotating it is 1615 x 928 px; it started at 1600 x 900 px)
```

---

## The advice

Framecut compares your framing against the slot and says what will go wrong:

| | |
|---|---|
| **slot** | where the image sits and what shape that container is |
| **N% cut** | how much of the photo the container throws away |
| **shape** | you're framing at one ratio, the slot is another |
| **too small** | the crop leaves fewer pixels than the slot needs — it will look blurry |
| **a bit soft** | fine on an ordinary screen, soft on retina |
| **sharp** | comfortably enough resolution |
| **headroom** | how far you can zoom before it degrades |
| **no crop** | `object-fit: contain` or `fill` — the whole image already shows |

The one that saves the most time is **N% cut**. When a portrait photo is dropped
into a wide banner, no amount of repositioning fixes it — the answer is to change
the container, and Framecut tells you which shape to change it to.

---

## Controls

- **Shape** — 4:3, square, 16:9, 3:4, 3:2, or free (the image's own shape)
- **Zoom** — 100–400%. Above 100% the output switches to a pixel crop
- **Rotate** — ±1° for straightening a tilted photo, ±90° for turning one upright
- **Slot** — the container size in CSS pixels, when there's no site to scan

---

## A note on how rotation works

The image is drawn onto a canvas *already rotated*, and the crop box is measured
against that canvas. Tilting the image with a CSS transform would look identical
but report coordinates for a file that was never rotated — quietly wrong numbers.
Rotating also grows the frame (1600×900 becomes 1615×928 at just 1°), which is why
the output names both sizes.

---

## Browser support

Anything current. `webkitdirectory` (the folder picker) is Chromium and Safari;
drag-and-drop and the file picker work everywhere.

`CONFIG.scanPage` is subject to same-origin rules, so serve the tool and the site
from the same origin — the simplest way being `python3 -m http.server` in a folder
containing both.

---

## Licence

Proprietary. All rights reserved — see `LICENSE`.
