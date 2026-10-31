import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import React, { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import * as api from '../dist/esm/index.js';

async function setup(t, props = {}) {
  const dom = new JSDOM(
    '<div id="mount"></div><article><section id="one"></section><section id="two"></section></article>',
    { url: 'https://example.test' },
  );
  const saved = new Map();
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const containerRef = createRef();
  containerRef.current = document.querySelector('article');
  Object.defineProperties(containerRef.current, {
    scrollHeight: { configurable: true, value: 1000 },
    clientHeight: { configurable: true, value: 200 },
  });
  const root = createRoot(document.getElementById('mount'));
  let unmounted = false;
  const unmount = async () => {
    if (!unmounted) {
      await act(() => root.unmount());
      unmounted = true;
    }
  };
  const render = async (extra = {}) =>
    act(() =>
      root.render(React.createElement(api.ReadingProgress, { containerRef, ...props, ...extra })),
    );
  t.after(async () => {
    await unmount();
    dom.window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  return { dom, containerRef, render, unmount };
}

test('ESM and CJS runtime APIs match', () => {
  assert.deepEqual(
    Object.keys(createRequire(import.meta.url)('../dist/cjs/index.js')).sort(),
    Object.keys(api).sort(),
  );
});

test('progress helper clamps, handles short content and nonfinite metrics', () => {
  assert.equal(api.calculateReadingProgress(400, 1000, 200), 0.5);
  assert.equal(api.calculateReadingProgress(-10, 1000, 200), 0);
  assert.equal(api.calculateReadingProgress(2000, 1000, 200), 1);
  assert.equal(api.calculateReadingProgress(0, 100, 200), 1);
  assert.equal(api.calculateReadingProgress(NaN, 100, 20), 0);
});

test('tracks only the scoped container and exposes an accessible native progress', async (t) => {
  const changes = [];
  const { dom, containerRef, render } = await setup(t, {
    onChange: (state) => changes.push(state),
  });
  await render();
  const container = containerRef.current;
  container.scrollTop = 400;
  await act(() => container.dispatchEvent(new dom.window.Event('scroll')));
  assert.equal(document.querySelector('progress').value, 0.5);
  assert.equal(document.querySelector('progress').getAttribute('aria-label'), 'Reading progress');
  container.scrollTop = 800;
  await act(() => dom.window.dispatchEvent(new dom.window.Event('scroll')));
  assert.equal(document.querySelector('progress').value, 0.5);
  assert.equal(changes.length, 2);
});

test('reports sections in supplied document order', async (t) => {
  const changes = [];
  const { containerRef, render } = await setup(t, { onChange: (state) => changes.push(state) });
  containerRef.current.getBoundingClientRect = () => ({ top: 10 });
  const first = createRef();
  const second = createRef();
  first.current = document.getElementById('one');
  second.current = document.getElementById('two');
  first.current.getBoundingClientRect = () => ({ top: -50 });
  second.current.getBoundingClientRect = () => ({ top: 9 });
  await render({
    sections: [
      { id: 'one', ref: first },
      { id: 'two', ref: second },
    ],
  });
  assert.equal(changes.at(-1).activeSection, 'two');
});

test('restores optional local position, saves scroll and unmount without module state', async (t) => {
  const values = new Map([['book', '400']]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const { containerRef, render, unmount, dom } = await setup(t, {
    storage,
    storageKey: 'book',
    restore: true,
  });
  await render();
  assert.equal(containerRef.current.scrollTop, 400);
  assert.equal(document.querySelector('progress').value, 0.5);
  containerRef.current.scrollTop = 600;
  await act(() => containerRef.current.dispatchEvent(new dom.window.Event('scroll')));
  assert.equal(values.get('book'), '600');
  await unmount();
  assert.equal(values.get('book'), '600');
});

test('storage errors are reported without breaking progress', async (t) => {
  const errors = [];
  const storage = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('quota');
    },
  };
  const { render, containerRef, dom } = await setup(t, {
    storage,
    storageKey: 'book',
    restore: true,
    onStorageError: (error) => errors.push(error),
  });
  await render();
  containerRef.current.scrollTop = 80;
  await act(() => containerRef.current.dispatchEvent(new dom.window.Event('scroll')));
  assert.equal(document.querySelector('progress').value, 0.1);
  assert.equal(errors.length, 2);
});

test('resize observation refreshes metrics and cleanup removes listeners and observers', async (t) => {
  const changes = [];
  const { dom, render, containerRef, unmount } = await setup(t, {
    onChange: (state) => changes.push(state),
  });
  let callback;
  let disconnects = 0;
  dom.window.ResizeObserver = class {
    constructor(cb) {
      callback = cb;
    }
    observe() {}
    disconnect() {
      disconnects++;
    }
  };
  await render();
  Object.defineProperty(containerRef.current, 'scrollHeight', { value: 200 });
  await act(() => callback([]));
  assert.equal(document.querySelector('progress').value, 1);
  const count = changes.length;
  await unmount();
  containerRef.current.dispatchEvent(new dom.window.Event('scroll'));
  dom.window.dispatchEvent(new dom.window.Event('resize'));
  assert.equal(changes.length, count);
  assert.ok(disconnects > 0);
});
