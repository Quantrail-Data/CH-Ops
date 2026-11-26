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
  it('showcase screenshots are clickable and open a preview', () => {
    // the framed screenshot carousel wires each slide to the lightbox state
    expect(code.match(/onClick=\{\(\) => setLightboxSrc\(img\)\}/g)?.length).toBe(1);
    expect(code).toContain('login-window-img');
    expect(code).toContain('login-lightbox-overlay');
    expect(code).toContain('login-lightbox-img');
  });

  it('preview closes on backdrop click, close button, and Escape', () => {
    expect(code).toContain('onClick={() => setLightboxSrc(null)}'); // backdrop + button
    expect(code).toContain('login-lightbox-close');
    expect(code).toContain('"Escape") setLightboxSrc(null)');
  });
});

describe('Login layout: follows the Login design (Login.dc.html)', () => {
  const css = fs.readFileSync('src/frontend/styles/global.css', 'utf8');
  const ruleOf = (selector) => css.slice(css.indexOf(selector + ' {'), css.indexOf('}', css.indexOf(selector + ' {')) + 1);

  it('has the product side on the left and the sign-in card on the right', () => {
    expect(code.indexOf('className="login-showcase"')).toBeLessThan(code.indexOf('className="login-form-panel"'));
    expect(code).toContain('className="login-card-shine"');
    expect(code).toContain('className="login-card"');
  });

  it('puts both sides in one centered group, with the logo above the card', () => {
    expect(code).toContain('className="login-layout"');
    expect(ruleOf('.login-layout')).toContain('max-width: 77.5rem');
    const panel = code.slice(code.indexOf('className="login-form-panel"'), code.indexOf('className="login-card-shine"'));
    expect(panel).toContain('className="login-brand"');
  });

  it('helps the browser to save the login details', () => {
    expect(code).toContain('name="username"');
    expect(code).toContain('name="password"');
    expect(code).toContain('method="post"');
    expect(code).toContain('navigator.credentials.store(credential)');
  });

  it('shows a small logo, not a 350px wide one', () => {
    expect(code).toContain('className="login-brand"');
    expect(ruleOf('.login-brand')).toContain('height: 2.5rem');
    expect(code).not.toContain('maxWidth: "350px"');
  });

  it('the page can scroll on short windows', () => {
    expect(ruleOf('.login-page')).toContain('overflow-x: hidden');
    expect(ruleOf('.login-page')).not.toMatch(/overflow: hidden/);
  });

  it('has the Forgot password link below the password input', () => {
    const inputIndex = code.indexOf('<PasswordInput id="login-password"');
    const rowIndex = code.indexOf('className="login-password-row"');
    expect(inputIndex).toBeLessThan(rowIndex);
    const row = code.slice(rowIndex, code.indexOf('</div>', rowIndex));
    expect(row).toContain('Forgot password?');
  });

  it('uses the design effects: Shine Border, no Shimmer Button, Aurora Text or Border Beam', () => {
    expect(css).toContain('@keyframes login-shine-turn');
    expect(code).not.toContain('ShimmerButton');
    expect(code).not.toContain('AuroraText');
    expect(code).not.toContain('BorderBeam');
  });

  it('stops the moving parts with reduced motion and with the Background animation switch', () => {
    expect(css).toContain('html.motion-off .login-card-shine::before');
    expect(css).toContain('html.motion-off .login-chips-track');
  });

  it('has no Google sign-in button (CHOps has no Google sign-in)', () => {
    expect(code).not.toMatch(/Sign in with Google/);
  });
});

describe('Login carousel: arrows, dots and text move together', () => {
  it('has arrow buttons and one dot button for each screenshot', () => {
    expect(code).toContain('aria-label="Previous screen"');
    expect(code).toContain('aria-label="Next screen"');
    expect(code).toContain('aria-label={`Show screen ${index + 1}`}');
  });

  it('moves the text when the screenshot changes, also by hand', () => {
    expect(code).toContain('onRealIndexChange={onScreenshotChange}');
    expect(code).toContain('swiperDatas[textIndex]');
    // Only one Swiper: the text is not a second carousel with its own timer.
    expect(code.match(/<Swiper\b/g)).toHaveLength(1);
  });
});

describe('Login carousel: screenshots match the theme', () => {
  it('shows dark screenshots on the dark theme and light ones on the light theme', () => {
    expect(code).toContain('const leftImages = theme === "dark" ? darkThemeImages : lightThemeImages;');
  });

  it('has 10 light and 10 dark screenshots, each list with its own set', () => {
    const lightList = code.slice(code.indexOf('const lightThemeImages'), code.indexOf('];', code.indexOf('const lightThemeImages')));
    const darkList = code.slice(code.indexOf('const darkThemeImages'), code.indexOf('];', code.indexOf('const darkThemeImages')));
    expect(lightList.match(/lightScreenshot\d\d/g)).toHaveLength(10);
    expect(lightList).not.toContain('darkScreenshot');
    expect(darkList.match(/darkScreenshot\d\d/g)).toHaveLength(10);
    expect(darkList).not.toContain('lightScreenshot');
  });

  it('each screenshot file exists', () => {
    for (const theme of ['light', 'dark']) {
      for (let number = 1; number <= 10; number++) {
        const file = `src/frontend/assets/login-${theme}-${String(number).padStart(2, '0')}.webp`;
        expect(fs.existsSync(file), file).toBe(true);
      }
    }
  });

  it('loads only the first slide at once; the other slides load when needed', () => {
    expect(code).toContain('loading={idx === 0 ? "eager" : "lazy"}');
  });
});
