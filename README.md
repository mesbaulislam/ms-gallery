# MS Gallery

A lightweight, offline photo gallery and editor for KaiOS feature phones. Version 2.4.0.

MS Gallery browses, organizes, favorites and edits photos entirely offline on a small keypad phone — with albums, search, a photo editor, collage maker, trash bin, and a PIN-protected private folder.

> **Platform:** KaiOS 2.5.3.2 (240×320 keypad phones, e.g. Energizer E241S)
> **Developer:** Mesbaul Islam ([@mesbaulislam](https://github.com/mesbaulislam))

![MS Gallery marketing banner](store-assets/marketing-banner.jpg)

## Features

- **Thumbnail grid** — windowed thumbnails with a live photo count; opens instantly from the scan cache; memory-safe (object URLs revoked aggressively)
- **Full-screen viewer** — previous/next, zoom with keys **1** (out) / **3** (in) + arrows, D-pad panning, fullscreen slideshow (3 / 5 / 10 second interval)
- **Photo editor** (canvas) — Crop, Rotate left/right, Flip, Brightness, Contrast, Temperature, Exposure, Black & White, and color filters: Sepia, Vivid, Cool, Warm, Vintage
- **Collage maker** — combine 2–4 photos into one image
- **Sort** — newest / oldest / name A–Z / name Z–A
- **Albums (Folders), Favorites, and filename Search**
- **Trash Bin** — delete moves a photo to trash; restore, delete forever, or empty the trash
- **Private Folder** — PIN-protected hidden photos, with its own PIN separate from the app lock
- **App Lock** — 4-digit PIN on launch (Settings > PIN Lock)
- **Multi-select** — batch delete (to trash), favorite, and Share Selected (all checked photos in one share sheet)
- **Image Info** — name, type, size, resolution, folder, and date, with D-pad scrolling
- **Rename, Share** (system share sheet: Messages, E-Mail, Facebook, Bluetooth — WhatsApp does not register a share handler on KaiOS 2.5), **Camera shortcut**
- **Set as** — Wallpaper (via the `setwallpaper` activity) or an Existing contact's photo (needs the `contacts` permission)
- **Open activity** — opens images tapped in the file manager
- **Pick activity** — other apps (Browser, Messages, …) can choose one or more photos from MS Gallery; it appears in the system picker
- **Settings** — thumbnail size (small / medium / large), sort, theme (dark / light — Onyx Gold), slideshow interval, startup screen, PIN lock, Private Folder PIN
- **Persistence** — favorites, settings, last folder, and selection are remembered
- **Keypad-first** — full D-pad / keypad navigation, no touchscreen needed; tab shortcuts **1** = Photos, **2** = Albums, **3** = Favorites; all extra features live in the Options menu

## Key map

| Key | Gallery | Viewer (fit) | Viewer (zoomed) |
| --- | --- | --- | --- |
| Left softkey | Camera | Pause/Resume (slideshow) | Pause/Resume (slideshow) |
| OK | Open photo | Fit <-> Actual size | Back to fit |
| Right softkey | Options | Options | Options |
| Arrows | Move selection | Prev/Next, Zoom in/out | Pan image |
| Back | Back / exit | Back to gallery | Back to gallery |

## Technologies used

- **Vanilla HTML, CSS, and ES5 JavaScript** — no framework, no build step
- **KaiOS 2.5, privileged app type** — `manifest.webapp` with `device-storage:pictures` and `device-storage:sdcard` (read/write) plus `contacts` (read/write) permissions; `open` and `pick` activities
- **DeviceStorage API** — photo scan, read, delete, and rename (all storage access in `js/storage.js`)
- **Canvas** — photo edits, filters, and collage rendering
- **localStorage** — settings, favorites, lock state, and KaiAds frequency cap
- **KaiAds SDK v5** — fullscreen ads at app startup / after PIN unlock, with a frequency cap (next ad only after five intervening app sessions); `TEST_MODE = 0` (production) in this release; if the SDK cannot load or no ad is available, the Gallery continues normally
- **Python 3 + Pillow** — the app icons are generated (see `tools` note in the project history)

## Project structure

```text
ms-gallery/
├── manifest.webapp            # KaiOS manifest (v2.4.0, privileged, permissions, activities)
├── index.html                 # All screens (single page, no reloads)
├── README.md
├── KAIADS-SDK-LICENSE         # KaiAds SDK license from the SDK archive
├── kaiads.v5.min.js           # KaiAds V5 loader (must stay at project root)
├── css/
│   └── style.css              # Onyx Gold theme (dark + light), 240x320 first
├── js/
│   ├── app.js                 # Boot, key routing, softkeys, camera, activity handler
│   ├── ads.js                 # KaiAds fullscreen integration (publisher ID, TEST_MODE)
│   ├── gallery.js             # Grid, windowed thumbnails, sort/search/folders
│   ├── viewer.js              # Viewer, zoom/pan, slideshow
│   ├── editor.js              # Canvas edits: crop, rotate, flip, adjust, filters, collage
│   ├── collage.js             # Collage maker
│   ├── favorites.js           # Persisted favorites (no file duplication)
│   ├── lock.js                # 4-digit PIN pad (app lock + private folder)
│   ├── pick.js                # 'pick' activity: other apps choose photo(s)
│   ├── settings.js            # Persisted settings
│   ├── storage.js             # DeviceStorage scan/get/delete/rename
│   ├── ui.js                  # Menus, dialogs, info, settings screens
│   └── utils.js               # Helpers, DEBUG flag
├── assets/
│   └── icons/
│       ├── icon-56.png
│       ├── icon-112.png
│       ├── icon-128.png
│       └── header-logo.png    # Style 5 header logo (in-app header only)
└── store-assets/
    └── marketing-banner.jpg   # KaiStore marketing banner (240x130)
```

## Installation and setup

```bash
git clone https://github.com/mesbaulislam/ms-gallery.git
cd ms-gallery
```

1. ZIP the **contents** of this folder, so `manifest.webapp` is at the ZIP root (not inside an extra folder).
2. Sideload to the phone with WebIDE / KaiOS dev tools. App type is `privileged`, which is required for `device-storage` read/write.
3. Grant storage permission on first launch if asked.

### For development

Open `index.html` in a browser or load the folder in a KaiOS simulator to try the interface. Set `DEBUG = true` in `js/utils.js` to log storage init, scan counts, and failures to the console. Keep it `false` for release builds.

## Usage

1. Open **MS Gallery** — the Photos tab shows your pictures as a thumbnail grid.
2. Move with the D-pad and press OK to open a photo full-screen.
3. In the viewer, use **1** / **3** to zoom, arrows to move between photos, and the Options menu (right softkey) for Edit, Share, Set as, Info, and more.
4. Press **2** for Albums, **3** for Favorites. Long lists, trash, and the private folder live in the Options menu.
5. In Settings, change thumbnail size, sort order, theme, slideshow interval, startup screen, or set the app lock / private folder PINs.

## Screenshots

No device screenshots are bundled in this repository yet. The KaiStore marketing banner above (`store-assets/marketing-banner.jpg`) is included as a preview.

## What's new in v2.4.0

- Multi-select Share Selected; Share now sends `type: 'image/*'` + `filepaths`, so Messages, E-Mail, and Facebook appear in the share sheet (not only Bluetooth)
- App Lock and Private Folder PINs separated, each with its own lock screen title
- Pick activity: MS Gallery appears in the system picker for other apps
- Edit Back returns to the toolbar from Collage and from applied-edit previews
- Set as → Wallpaper / Existing contact
- Header logo changed to the Style 5 design (in-app header only; the homescreen app icon is unchanged)
- Camera Back on user cancel stays silent; tab shortcuts 1/2/3; Albums has its own menu; Trash and Private Folder are separate main-menu items
- KaiAds `TEST_MODE = 0` (production ads) in this store release

## Credits & licensing

- **KaiAds:** the KaiAds V5 loader is bundled under its own terms — see `KAIADS-SDK-LICENSE`. The publisher ID in `js/ads.js` belongs to the developer. Ads are optional for the app to run; without an ad fill the Gallery works normally.
- **App code:** no separate code license file is included in this repository.
- **Icons:** the 56×56 and 112×112 icons are generated from the 128×128 app icon; the header logo is the Style 5 design.

## Developer

**Mesbaul Islam** — [@mesbaulislam](https://github.com/mesbaulislam)

© 2026 MS Gallery
