# RentalFlow UI Standards

Applies to the web and Android app in this repository.
Material 3 semantic roles and interaction patterns are adapted to the product's explicit shape and spacing rules.
This is a CSS implementation, not a migration to native Compose Material components.

## Foundations

- Grid: 12 equal tracks, 8 CSS px gutters, 20 CSS px outer margins. Mobile items generally span 12 or 6 tracks.
- CSS px correspond to logical Android dp in the WebView, not physical screenshot pixels.
- Shape: 8 px default, 12 px for large framed surfaces; standard circles and navigation indicators retain their shapes.
- Internal padding: 8 or 12 px. Screen edges use 20 px; section spacing uses 12, 24 or 32 px.
- Touch targets: minimum 48 px. Form controls use 56 px minimum height.
- Typography: Material 3 semantic roles using the device system font, regular (400) and medium (500). No viewport-scaled text or negative tracking.
- Color roles: primary green, secondary neutral green, tertiary blue, neutral surfaces, red errors and amber attention. Status also has text or icons.
- Elevation: outlined or tonal surfaces; no decorative nested cards or heavy shadows.

## Navigation

The app frame has a bounded viewport height. The page pane scrolls; the document does not.
Top bars occupy at least 64 px plus the top safe area. Mobile navigation occupies at least 80 px plus the bottom safe area. Both can grow with the user's text-size preference.
Dedicated detail views and dialogs sit above navigation. Save actions use a separate footer, outside scroll content.
Workflow setup hides main navigation on mobile. Desktop keeps the side navigation outside the editor. Onboarding remains an independent flow.

## Ownership

`src/design-system.css` owns color, spacing, geometry and shared visual rules and is loaded after existing component styles.
`src/typography.css` owns ALL font sizing, weights, families and line heights, and is loaded last. Do not add local font overrides to the legacy stylesheets.
Keep domain geometry (calendar day width, reservation duration) in existing component styles/logic.
Do not change date geometry just to conform to spacing increments.

The calendar uses `src/calendar.css` for geometry: 80 px per local day, a frozen product column, and frozen date headers inside one two-axis scroll pane. The date window slides by 28 days while retaining 56 rendered days. Product labels and booking tracks share grid row height. Time-accurate short bars are not artificially widened; the product-row button opens the visible period's accessible booking list instead.

## Typography Roles

The size/line-height values below are logical px at the default 16 px browser text size; CSS uses rem so user text preferences are respected.

| Role | Size / Line Height | Weight | Usage |
| --- | --- | --- | --- |
| Headline medium | 28 / 36 | 400 | Operational counts |
| Headline small | 24 / 32 | 400 | Page title, onboarding question, completion headline |
| Title large | 22 / 28 | 500 | App bar, current workflow step |
| Title medium | 16 / 24 | 500 | Section title, product/customer name, option title |
| Title small | 14 / 20 | 500 | Compact subheading |
| Body large | 16 / 24 | 400 | Inputs, instructions, notes |
| Body medium | 14 / 20 | 400 | Supporting explanations, error messages |
| Body small | 12 / 16 | 400 | Dates, identifiers, supplementary metadata |
| Label large | 14 / 20 | 500 | CTA, tabs, field labels |
| Label medium | 12 / 16 | 500 | Navigation labels, status badges, progress |

Use typography roles, not bolding every piece of information. Text uses zero tracking for Korean and tabular numerals for comparable dates/counts. Display-scale headings and 11 px labels are deliberately not used in this dense operational app.

The app uses the device system font, so it has no font download or bundled font asset. Android uses its system sans-serif family, including its Korean fallback.

## Verification

Start the app, then run `node scripts/design-system-check.cjs` with Playwright available via NODE_PATH.
Optional: RENTAL_TEST_URL, RENTAL_SCREENSHOTS, PLAYWRIGHT_CHANNEL (default msedge).
Run `node scripts/calendar-check.cjs` for long product names, short bookings, pinned axes, date jumping, bounded bidirectional scrolling, status colors and booking-detail navigation. Fixtures are injected only into browser preview requests and do not write to the backend.
Screenshots and test data remain local and are not committed.
Physical Android safe areas, IME behavior and system font scaling still require a connected device.

References: https://m3.material.io/styles/color/roles and https://m3.material.io/styles/typography/type-scale-tokens
