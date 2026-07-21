// Verifies the forced password-change gate: a user flagged mustChangePassword
// must hit the change-password screen before MainLayout renders, and a
// successful change clears the flag locally to match the backend.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
function read(f) { return fs.readFileSync(f, 'utf8'); }

describe('Forced password change gate', () => {
  const app = read('src/frontend/App.jsx');
  const gate = read('src/frontend/components/layout/ForceChangePassword.jsx');

  it('App renders ForceChangePassword instead of MainLayout when mustChangePassword is set', () => {
    expect(app).toContain('ForceChangePassword');
    expect(app).toMatch(/auth\.mustChangePassword\s*\?\s*<ForceChangePassword \/>\s*:\s*<MainLayout \/>/);
  });

  it('submits to the existing change-password endpoint', () => {
    expect(gate).toContain('/api/auth/change-password');
    expect(gate).toContain('currentPassword');
    expect(gate).toContain('newPassword');
  });

  it('clears mustChangePassword locally after a successful change', () => {
    expect(gate).toContain('mustChangePassword: false');
  });

  it('enforces the same minimum password length as self-service change', () => {
    expect(gate).toContain('newPassword.length < 8');
  });
});
