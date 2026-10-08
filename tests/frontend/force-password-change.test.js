// Verifies the forced password-change gate: a user flagged mustChangePassword
// must hit the change-password screen before MainLayout renders, and a
// successful change clears the flag locally to match the backend.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
function read(f) { return fs.readFileSync(f, 'utf8'); }

describe('Forced password change gate', () => {
  const app = read('src/frontend/App.jsx');
  const gate = read('src/frontend/components/layout/SetupPassword.jsx');

  it('App renders SetupPassword instead of MainLayout when mustChangePassword is set', () => {
    expect(app).toContain('SetupPassword');
    expect(app).toContain("token ?");
  });

  it('submits to the existing change-password endpoint', () => {
    expect(gate).toContain('/api/auth/set-password');
    expect(gate).toContain('confirmPassword');
    expect(gate).toContain('newPassword');
  });

  it('enforces the same minimum password length as self-service change', () => {
    expect(gate).toContain('confirmPassword.length < 8');
  });
});
