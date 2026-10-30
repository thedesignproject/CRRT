# CRRT landing capture scroll story

## Goal

Replace the capture-source tabs in the existing CRRT landing page with a scroll-led product story that makes Widget, Chrome, Storybook, and Record feel meaningfully different while preserving the current landing's visual language.

## Scope

This work changes only the existing `InstallPaths` section and its tests/styles. It does not create a separate page, change the hero, alter pricing, or introduce new backend behavior.

## Experience

The section opens with the message **“Feedback starts wherever work happens.”** A four-chapter narrative sits beside one sticky demonstration stage.

On desktop:

- The chapter rail scrolls normally on the left.
- The demonstration stage remains sticky on the right.
- Widget, Chrome, Storybook, and Record each occupy enough vertical space to make the progression deliberate.
- The active chapter is selected from scroll position and may also be activated by clicking or focusing it.
- A restrained transition changes the surface, cursor, feedback artifact, captured context, and final handoff state.
- A slim progress line shows where the reader is in the four-part story.

On mobile:

- Sticky behavior is removed.
- Each chapter is followed by its own compact visual state.
- All content remains visible without horizontal scrolling or hover.

## Chapters

### Widget

Shows CRRT embedded in a product. A comment is pinned to a selected UI element with screenshot, viewport, selector, and project instructions attached.

### Chrome

Shows CRRT reviewing a page before product installation. The browser-extension treatment replaces the embedded widget while preserving the same project workflow.

### Storybook

Shows a real component story, its automated checks, and the ability to send either manual feedback or a failed check to CRRT. The component and story identity remain attached.

### Record

Shows a short interaction timeline rather than a static page. A timestamped feedback moment becomes the active artifact. Record remains clearly labeled as a private preview.

## Visual direction

The section keeps the current CRRT palette, typography, borders, radii, and editorial scale. The memorable device is the changing sticky stage; surrounding typography and chapter navigation stay quiet. The four chapters must not look like four interchangeable SaaS cards.

Motion is functional rather than decorative. Content crossfades and repositions only when the active chapter changes. `prefers-reduced-motion` disables animated transitions without removing information.

## Interaction and accessibility

- Chapter controls are native buttons with a programmatic active state.
- Scrolling updates the active state through `IntersectionObserver`.
- Manual selection scrolls or updates the stage without trapping focus.
- The layout remains understandable with JavaScript disabled: all chapter copy is present in document order.
- Decorative demo chrome is hidden from assistive technology; meaningful labels and actions remain available.
- Keyboard focus is visible and color is not the sole indicator of the active chapter.

## Component boundaries

- `InstallPaths` owns chapter state and section composition.
- Static chapter content lives in one typed data structure.
- `CaptureChapter` renders a chapter control and copy.
- `CaptureStage` renders the selected visual state.
- Shared evidence and handoff elements remain reusable within the stage.

No new package or backend dependency is required.

## Verification

- Component tests cover all four chapters, click selection, labels, destinations, and the Record preview state.
- Tests mock `IntersectionObserver` to verify scroll activation.
- Desktop QA verifies sticky transitions and section boundaries.
- Mobile QA verifies the stacked fallback.
- Reduced-motion QA verifies that state changes remain immediate and complete.
- Existing landing typecheck and production build must pass.

## Out of scope

- Publishing Record publicly.
- Adding real recording playback.
- Changing the CRRT dashboard or capture APIs.
- Reworking other landing sections during this design pass.
