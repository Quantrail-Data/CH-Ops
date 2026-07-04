// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Application bootstrap file that mounts the root React component to the DOM and initializes global styles.

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/global.css';
import { SPRITE } from './assets/iconSprite.js';

// Inject the inlined Tabler icon sprite once, before render, so every
// <use href="#tabler-..."> resolves as a same-document reference. This works in
// all browsers (including Safari, which does not support cross-file <use>).
if (!document.getElementById('chops-icon-sprite')) {
  const host = document.createElement('div');
  host.id = 'chops-icon-sprite';
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  host.innerHTML = SPRITE;
  document.body.prepend(host);
}

createRoot(document.getElementById('root')).render(<App />);
