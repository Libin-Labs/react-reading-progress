# @lp-labs/react-reading-progress

Element-scoped reading progress for React 18.2 and 19. Track a scroll container,
report sections, and optionally restore a saved pixel position. No window scroll
tracking or module-global reading state. React is the only peer and there are no
runtime dependencies.

## Install and use

```sh
npm install @lp-labs/react-reading-progress react
```

```tsx
import { useMemo, useRef } from "react";
import { ReadingProgress } from "@lp-labs/react-reading-progress";
import "@lp-labs/react-reading-progress/style.css";

export function Reader() {
  const containerRef = useRef<HTMLDivElement>(null);
  const introduction = useRef<HTMLElement>(null);
  const details = useRef<HTMLElement>(null);
  const sections = useMemo(() => [
    { id: "introduction", ref: introduction },
    { id: "details", ref: details },
  ], []);
  return (
    <>
      <ReadingProgress
        containerRef={containerRef}
        sections={sections}
        storageKey="reader:article-one:v1"
        restore
        onChange={({ activeSection }) => console.log(activeSection)}
        onStorageError={(error) => console.warn("Position not saved", error)}
      />
      <div ref={containerRef} style={{ height: 300, overflowY: "auto" }}>
        <section ref={introduction} style={{ minHeight: 500 }}>Introduction</section>
        <section ref={details} style={{ minHeight: 500 }}>Details</section>
      </div>
    </>
  );
}
```

## Exports and types

`ReadingSection` is `{ id: string; ref: RefObject<HTMLElement | null> }`.
Pass sections in document order with stable IDs. Sections outside the container
are ignored. `ReadingProgressState` is `{ progress: number; activeSection:
string | null }`. Progress is a fraction from 0 to 1, not a percentage.

`useReadingProgress(options: ReadingProgressOptions): ReadingProgressState`
and `ReadingProgress(props: ReadingProgressProps)` share these options:

| Option | Type | Default / behavior |
| --- | --- | --- |
| `containerRef` | `RefObject<HTMLElement \| null>` | Required; the scrolling element, not merely its content. |
| `sections` | `readonly ReadingSection[]` | Omitted; active section is null. |
| `storageKey` | `string` | Omitted/empty: no storage access. Use a document/version-specific key. |
| `storage` | `Pick<Storage, "getItem" \| "setItem">` | Omitted: container window's sessionStorage, accessed only when a key is set. |
| `restore` | `boolean` | `false`; whether to read a saved position on effect setup. Saving still occurs with a key when restore is false. |
| `onChange` | `(state: ReadingProgressState) => void` | Optional; initial measurement, then changed progress or section. |
| `onStorageError` | `(error: unknown) => void` | Optional; storage access/read/write exceptions, otherwise silently ignored. |

`ReadingProgressProps` adds `label?: string` (default `"Reading progress"`),
`className?: string` (default `""`, appended to `lp-reading-progress`), and
`style?: CSSProperties` (no default). The component renders a native `<progress>`
with `max={1}`, current value, label, and percentage fallback text. It does not
display section names; use the hook for a custom UI.

The hook initially returns `{ progress: 0, activeSection: null }` before the
mount measurement. An active section is the last supplied in-container section
whose top has crossed the container's inner top (one-pixel tolerance). No crossed
section means null. `onChange` runs after measurements, including first setup.
Keep options/ref objects/section arrays stable to avoid effect resets and repeated
restore. Callback references may change without reattaching listeners.

`calculateReadingProgress(scrollTop: number, scrollHeight: number,
clientHeight: number): number` computes
`scrollTop / max(0, scrollHeight - clientHeight)` clamped to 0-1. Content that
does not overflow is complete (`1`). Nonfinite inputs return `0`. It is pure,
does not access the DOM, and does not throw for numeric edge cases.

### Custom presentation

```tsx
import { useRef } from "react";
import {
  useReadingProgress,
  calculateReadingProgress,
} from "@lp-labs/react-reading-progress";

export function CompactReader() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { progress, activeSection } = useReadingProgress({ containerRef });
  return (
    <>
      <output>{Math.round(progress * 100)}% {activeSection ?? ""}</output>
      <div ref={containerRef} style={{ height: 250, overflow: "auto" }}>
        <p style={{ minHeight: 900 }}>Long content.</p>
      </div>
      <small>Example metric: {calculateReadingProgress(400, 1000, 200)}</small>
    </>
  );
}
```

## Restoration, lifecycle, and browser limits

Saved values are plain scrollTop pixel strings. Missing/nonfinite values are
ignored; restored values are clamped to the current scrollable range. Restoration
runs once per effect setup, not after delayed content arrives. Load content
before mounting or restore at the application level if layout changes later.
Keys have no implicit text versioning or cross-tab synchronization. Storage is
caller-owned; no entries are removed.

The hook listens to the element's scroll event and its owning window's resize
event, observes container/direct-child size changes with ResizeObserver when
available, and observes descendant child/text changes with MutationObserver.
Size observation is refreshed after mutations. It measures synchronously on
scroll, with no animation loop or throttling. Large section lists may need an
application-level alternative. Transform-only layout shifts and attribute-only
changes are not comprehensively detected. Without ResizeObserver, scroll, resize,
and text/child changes still refresh. On cleanup it saves the position, removes
listeners, and disconnects both observers.

Use mounted stable refs; ref target replacement alone does not trigger an
effect. Vertical scrolling only; no document/window scrolling, horizontal
progress, virtualized reading model, or proof of actual reading. Imports and
SSR need no browser globals; browser measurement starts in effects. Exceptions
from caller callbacks propagate; storage exceptions are handled as above.
Development Strict Mode may measure/save more than once.

## CSS and accessibility

Import CSS explicitly and customize `--reading-accent` or
`.lp-reading-progress`. Native progress semantics avoid live announcements on
every scroll. Give multiple indicators distinct labels. Short content being
complete is intentional. The hook does not move focus, intercept keys, or change
scroll position unless restoration is explicitly enabled.

## License

[MIT](./LICENSE).

## Support

If this library is useful to you, consider supporting its maintenance with a [donation via PayPal](https://www.paypal.me/LibinPrasanth).

## Author

Created by [Libin Prasanth](https://www.linkedin.com/in/libinprasanth/). Connect on LinkedIn for updates and discussion.
