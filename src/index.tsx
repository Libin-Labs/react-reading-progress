import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';

export function calculateReadingProgress(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
): number {
  if (![scrollTop, scrollHeight, clientHeight].every(Number.isFinite)) return 0;
  const distance = Math.max(0, scrollHeight - clientHeight);
  return distance === 0 ? 1 : Math.max(0, Math.min(1, scrollTop / distance));
}

export interface ReadingSection {
  id: string;
  ref: RefObject<HTMLElement | null>;
}

export interface ReadingProgressState {
  progress: number;
  activeSection: string | null;
}

export interface ReadingProgressOptions {
  containerRef: RefObject<HTMLElement | null>;
  sections?: readonly ReadingSection[];
  storageKey?: string;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  restore?: boolean;
  onChange?: (state: ReadingProgressState) => void;
  onStorageError?: (error: unknown) => void;
}

export function useReadingProgress({
  containerRef,
  sections,
  storageKey,
  storage,
  restore = false,
  onChange,
  onStorageError,
}: ReadingProgressOptions): ReadingProgressState {
  const [state, setState] = useState<ReadingProgressState>({ progress: 0, activeSection: null });
  const callbacks = useRef({ onChange, onStorageError });
  callbacks.current = { onChange, onStorageError };

  useEffect(() => {
    const container = containerRef.current;
    const view = container?.ownerDocument.defaultView;
    if (!container || !view) return;
    let store = storage;
    if (storageKey && !store) {
      try {
        store = view.sessionStorage;
      } catch (error) {
        callbacks.current.onStorageError?.(error);
      }
    }
    if (restore && storageKey && store) {
      try {
        const saved = store.getItem(storageKey);
        const value = saved === null ? NaN : Number(saved);
        if (Number.isFinite(value)) {
          container.scrollTop = Math.max(
            0,
            Math.min(value, Math.max(0, container.scrollHeight - container.clientHeight)),
          );
        }
      } catch (error) {
        callbacks.current.onStorageError?.(error);
      }
    }
    let previous: ReadingProgressState | undefined;
    const update = () => {
      const top = container.getBoundingClientRect().top + container.clientTop;
      let activeSection: string | null = null;
      for (const section of sections ?? []) {
        if (
          section.ref.current &&
          container.contains(section.ref.current) &&
          section.ref.current.getBoundingClientRect().top <= top + 1
        ) {
          activeSection = section.id;
        }
      }
      const next = {
        progress: calculateReadingProgress(
          container.scrollTop,
          container.scrollHeight,
          container.clientHeight,
        ),
        activeSection,
      };
      if (previous?.progress !== next.progress || previous.activeSection !== next.activeSection) {
        previous = next;
        setState(next);
        callbacks.current.onChange?.(next);
      }
    };
    const save = () => {
      if (storageKey && store) {
        try {
          store.setItem(storageKey, String(container.scrollTop));
        } catch (error) {
          callbacks.current.onStorageError?.(error);
        }
      }
    };
    const onScroll = () => {
      update();
      save();
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    view.addEventListener('resize', update);
    const ResizeObserverClass = view.ResizeObserver;
    const observer = ResizeObserverClass ? new ResizeObserverClass(update) : null;
    observer?.observe(container);
    for (const child of Array.from(container.children)) observer?.observe(child);
    const mutation = new view.MutationObserver(() => {
      observer?.disconnect();
      observer?.observe(container);
      for (const child of Array.from(container.children)) observer?.observe(child);
      update();
    });
    mutation.observe(container, { childList: true, subtree: true, characterData: true });
    update();
    return () => {
      save();
      container.removeEventListener('scroll', onScroll);
      view.removeEventListener('resize', update);
      observer?.disconnect();
      mutation.disconnect();
    };
  }, [containerRef, sections, storageKey, storage, restore]);
  return state;
}

export interface ReadingProgressProps extends ReadingProgressOptions {
  label?: string;
  className?: string;
  style?: CSSProperties;
}

export function ReadingProgress({
  label = 'Reading progress',
  className = '',
  style,
  ...options
}: ReadingProgressProps) {
  const { progress } = useReadingProgress(options);
  return (
    <progress
      className={`lp-reading-progress ${className}`}
      style={style}
      max={1}
      value={progress}
      aria-label={label}
    >
      {Math.round(progress * 100)}%
    </progress>
  );
}
