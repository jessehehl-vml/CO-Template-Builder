# Changelog

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
