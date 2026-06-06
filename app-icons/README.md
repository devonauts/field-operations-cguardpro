# App icons & splash

Drop your artwork here. On the **next build** (`uploadApps` → 1/2/3, or `pyBuild`/`Install`) it is
automatically resized into every Android & iOS icon, the launch splash, and the store/launcher
icon embedded in the app — no extra step.

## Required
| File | Size | Notes |
|---|---|---|
| `icon.png` | **1024 × 1024** | The app icon. PNG, square, **no transparency**, no rounded corners (the OS rounds it). This is also the App Store / launcher icon. |

## Optional (sensible defaults used if you omit them)
| File | Size | Notes |
|---|---|---|
| `icon-foreground.png` | 1024 × 1024 | Android adaptive-icon foreground. Keep the logo inside the centre ~66% (safe zone) — the edges get cropped to a circle/squircle. If omitted, `icon.png` is used. |
| `icon-background.png` | 1024 × 1024 | Android adaptive-icon background. If omitted, the navy `#0A0E16` background color is used. |
| `splash.png` | **2732 × 2732** | Launch screen. Put the logo centred in the middle ~1200px — the edges are cropped on phones. If omitted, the current splash is kept. |
| `splash-dark.png` | 2732 × 2732 | Dark-mode splash. If omitted, `splash.png` (or the current one) is used. |

## What happens on build
1. Files here are copied into `assets/` and `capacitor-assets` regenerates all native sizes
   (Android `mipmap-*`, iOS `AppIcon.appiconset`, PWA).
2. A `build-output/play-store-icon-512.png` is produced for you to upload **by hand** in
   Play Console (the 512 listing icon is not part of the `.aab`). The App Store 1024 icon *is*
   embedded in the build automatically.

## Tips
- Export at exactly the sizes above so nothing is upscaled.
- For a crisp result, keep `icon.png` edge-to-edge artwork (the OS adds the rounding).
- Replacing the seeded `icon.png` with your own is all most people need to do.
