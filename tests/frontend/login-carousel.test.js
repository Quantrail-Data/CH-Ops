// Guards for the login page feature carousel (swiperDatas): it must reflect the
// current app state, use the correct product name, and stay free of em/en dashes.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail Data Private Limited

import { describe, it, expect } from 'vitest';
import fs from 'fs';

const code = fs.readFileSync('src/frontend/components/layout/LoginPage.jsx', 'utf8');
// Isolate the carousel data array for the content assertions.
const arr = code.slice(code.indexOf('const swiperDatas'), code.indexOf('\n];', code.indexOf('const swiperDatas')));

describe('Login carousel: reflects the current app state', () => {
  it('has a dedicated slide for each recently added tool', () => {
    expect(arr).toContain('Compare Queries.'); // Query Comparison + cost estimate
    expect(arr).toContain('cost before you execute');
    expect(arr).toContain('Ask Qurioz.'); // Qurioz AI
    expect(arr).toContain('Qurioz AI turns plain questions');
    expect(arr).toContain('Schema Studio walks you through'); // Schema Studio
  });

  it('lists the supported alert notification channels', () => {
    expect(arr).toContain('Email, Slack, Google Chat, Microsoft Teams, and PagerDuty');
    // the stale Pro framing is gone
    expect(arr).not.toContain('automated cloud backups');
    expect(arr).not.toContain('CH-Ops Pro');
  });

  it('security slide reflects the hardened auth model', () => {
    expect(arr).toContain('encrypted server-side credential sessions');
    expect(arr).toContain('idle sign-out');
    // the contradictory "no agents, no VPN" claim was removed
    expect(arr).not.toContain('no agents, no VPN');
  });
});

describe('Login carousel: naming and formatting conventions', () => {
  it('uses the product name "CHOps" (never "CH-Ops")', () => {
    expect(code).not.toContain('CH-Ops');
    expect(arr).toContain('CHOps');
  });

  it('references the website ch-ops.io', () => {
    expect(arr).toContain('ch-ops.io');
  });

  it('contains no em or en dashes', () => {
    expect(/[\u2013\u2014]/.test(code)).toBe(false);
  });
});

describe('Login carousel: image preview (lightbox)', () => {
  it('marquee thumbnails are clickable and open a preview', () => {
    // both marquee columns wire the click to the lightbox state
    expect(code.match(/onClick=\{\(\) => setLightboxSrc\(img\)\}/g)?.length).toBe(2);
    expect(code).toContain('login-lightbox-overlay');
    expect(code).toContain('login-lightbox-img');
  });

  it('preview closes on backdrop click, close button, and Escape', () => {
    expect(code).toContain('onClick={() => setLightboxSrc(null)}'); // backdrop + button
    expect(code).toContain('login-lightbox-close');
    expect(code).toContain('"Escape") setLightboxSrc(null)');
  });
});

describe('Login layout: logo cannot overlap the form', () => {
  const css = fs.readFileSync('src/frontend/styles/global.css', 'utf8');
  const logoBox = css.slice(css.indexOf('.logo-img-container'), css.indexOf('}', css.indexOf('.logo-img-container')) + 1);
  const leftCol = css.slice(css.indexOf('.left-container-login {'), css.indexOf('}', css.indexOf('.left-container-login {')) + 1);

  it('logo image is responsive (capped width, auto height), not a fixed 400px', () => {
    expect(code).toContain('width: "100%"');
    expect(code).toContain('maxWidth: "400px"');
    expect(code).toContain('height: "auto"');
    expect(code).not.toContain('width: "400px", pointerEvents');
  });

  it('logo container no longer has a fixed height for a taller logo to overflow', () => {
    expect(logoBox).not.toContain('height: 300px');
    expect(logoBox).toContain('max-width: 400px');
  });

  it('left column scrolls instead of clipping on short viewports', () => {
    expect(leftCol).toContain('overflow-y: auto');
  });
});
