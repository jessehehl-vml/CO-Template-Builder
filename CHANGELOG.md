# Changelog

## 0.0.9

### Changed

- Saving the **Dimensions** page now gives every variant content for each new size, copied from its first size, so the preview no longer skips new sizes. Check the copied content under Placeholders.
- Saving the **Fonts** page now also updates the `--fontN` variables in `src/styles.css`.
- Renaming the project in **Adset details** now updates the name in the `script.js` header comment.
- Fonts chosen in the wizard are written to `index.html` inside the managed font block from the start.
- The settings panel stays loaded while hidden, so unsaved edits survive switching tabs.

### Fixed

- The sidebar no longer flashes "Create new template" before showing the menu of an existing project. The project state is read from disk and embedded in the first paint, instead of waiting for the account request.
- The settings page now shows the section you picked after switching to another tab and back.
- Font links in `index.html` were sometimes removed. Saving a page other than Fonts rewrote the font block as empty.
- `placeholders` in `settings.json` could be emptied by saving another page, including when a product collection was mapped.
- Saving any page rewrote `content.json` from a possibly stale copy. It is now only written when saving Placeholders.
- Custom sizes were lost or saved with the wrong values, and could not be used when creating a project. The Dimensions page and the wizard now share one copy, and everything downstream receives real sizes such as `300x250`.
- The Dimensions Save button was always enabled.
- A logged-in email was cleared when the project state updated, for example right after creating a project.

## 0.0.8

### Fixed

- Creating the boilerplate now opens the folder you selected in step 1 when it is not the open workspace. With no folder open it opens in the same window, and if another folder is open it opens in a new window.
- The **Select folder** button in step 1 is no longer stretched across the full window.

## 0.0.7

### Added

- **Add-ons** menu in Settings: turn Auto-scale fonts, Browser check and SplitText on or off after the boilerplate has been created. Saving adds or removes the code in `src/Creative.js`, `src/script.js` and `src/index.html`. The checkboxes show what is really in the files, and anything that cannot be applied is reported instead of changed.
- **Browser check** option: adds `Creative.check` with helpers such as `mobile()`, `desktop()`, `ios()`, `android()`, `osx()`, `windows()`, `retina()`, `chrome()`, `safari()`, `firefox()`, `edge()` and `ie()`. The code is rewritten for current browsers, including Chromium Edge and iPadOS.
- **SplitText** option: adds GSAP's SplitText plugin to `index.html`. GSAP core and SplitText load at the latest version (3.15.0) so they match.

### Changed

- The "Create boilerplate" step groups its options into **Project setup** (number of frames, auto-fill) and **Add-ons** (auto-scale fonts, browser check, SplitText).
- The changelog is now included in the package, so it shows on the Marketplace.

### Fixed

- Saving Adset details, Dimensions or Fonts no longer replaces the saved placeholders in `settings.json` with an empty set.

## 0.0.6

### Added

- **Copy for Asana:** a copy icon in the code review panel (in the header, or in the filter bar in full-screen view) copies a plain-language report to the clipboard. It pastes into Asana with bold headings, lists and colored markers (🔴 must fix, 🟠 should check, 🔵 optional). The report shows the overall result (not ready, incomplete or ready), which checks were run, and each issue in everyday words with the technical details listed for the developer.

## 0.0.5

### Added

- **Code review** in the preview, with three checks: Check code, Test variants and AI review (GitHub Copilot). Results can be filtered by severity, check, rule and file.
- New code checks:
  - GSAP timelines that QA mode cannot pause (`ANI-003`)
  - selectors that match nothing (`SEL-001`)
  - duplicate or mismatched libraries and missing GSAP plugins (`LIB-001`)
  - missing `dimensions/WxH.css` files (`DIM-001`)
  - consecutive `Creative.addWait` calls that can be combined
- New variant-test checks: text outside the banner or cut off at the end of each frame, and images without a `src`.
- AI review rules for dead code (`DEAD-001`) and repeated animation code (`DRY-001`).
- Auto-scale fonts option and ZIP export.
- Storyboards in QA mode: the Overlay checkbox is only available when a storyboard exists for the size, and frames without one show "No storyboard available". Storyboard images are shown at the banner's size, so 2x images line up.

### Changed

- `autoScaleFont` measures the element itself instead of its first child.
- Generated projects register all images with a single `Creative.addWait(...)` call.

### Fixed

- QA mode now pauses each frame: `Creative.js` handles `preview-pause` and sends `creative-ready` once the timeline is built.
- Animations outside the frame timelines are reported as warnings by the AI review, not errors.

## 0.0.4

See the git history for earlier changes.
