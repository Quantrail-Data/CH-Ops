// Contributors - Praveen kumar
// setup.js - shared vitest environment setup: jest-dom, a Blob.text polyfill and async timeouts
// Copyright (C) 2026 Quantrail™ Data Private Limited

import '@testing-library/jest-dom';
import { configure } from '@testing-library/dom';

// waitFor and findBy* default to 1000ms of wall clock. That is generous when a
// single worker has the machine to itself and much too tight when six or eight
// share it: jsdom setup alone is the largest slice of a parallel run, so a
// component that renders in 50ms of CPU can still miss a 1s deadline. Raising
// it costs nothing on a passing test - the poll exits as soon as the condition
// holds - and only changes how long a genuinely failing one waits before it
// reports.
configure({ asyncUtilTimeout: 5000 });

// jsdom implements File but not Blob.prototype.text(), which is standard in
// every browser. Code that reads an upload with `await file.text()` therefore
// rejects, the component never updates, and the test fails as a waitFor
// timeout rather than as an error - which is a slow and misleading way to
// discover a missing environment method.
if (typeof Blob !== 'undefined' && typeof Blob.prototype.text !== 'function') {
  Blob.prototype.text = function text() {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}
