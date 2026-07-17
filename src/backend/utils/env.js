// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Loads environment configs, requiring a super admin and SESSION_SECRET for seeding databases and auth fallbacks.

export function loadEnv() {
  if (!process.env.SUPER_ADMIN_1 || !process.env.SUPER_ADMIN_1_PASSWORD || !process.env.SUPER_ADMIN_1_EMAIL) {
    // Backward compat: check legacy single-admin format
    if (!process.env.SUPER_ADMIN || !process.env.SUPER_ADMIN_PASSWORD || !process.env.SUPER_ADMIN_1_EMAIL) {
      throw new Error('Missing required env: SUPER_ADMIN_1 and SUPER_ADMIN_1_PASSWORD');
    }
  }
  if (!process.env.SESSION_SECRET) throw new Error('Missing required env: SESSION_SECRET');

  // Collect up to 3 super admins from numbered env vars
  const superAdmins = [];
  for (let i = 1; i <= 3; i++) {
    const u = process.env[`SUPER_ADMIN_${i}`];
    const p = process.env[`SUPER_ADMIN_${i}_PASSWORD`];
    const em = process.env[`SUPER_ADMIN_${i}_EMAIL`];
    if (u && p && em) superAdmins.push({ username: u, password: p,email:em });
  }
  // Legacy fallback for old .env files that use SUPER_ADMIN (no number)
  if (superAdmins.length === 0 && process.env.SUPER_ADMIN && process.env.SUPER_ADMIN_PASSWORD && process.env.SUPER_ADMIN_EMAIL) {
    superAdmins.push({ username: process.env.SUPER_ADMIN, password: process.env.SUPER_ADMIN_PASSWORD,email:process.env.SUPER_ADMIN_EMAIL });
  }

  return {
    superAdmins,
    sessionSecret: process.env.SESSION_SECRET,
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    disableEnvLogin: process.env.DISABLE_ENV_LOGIN === 'true',
    frontendLink:process.env.FRONTEND_LINK,
    smtp: {
      host: process.env.SMTP_HOST || '',
      port: process.env.SMTP_PORT || '587',
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
      from: process.env.SMTP_FROM || 'CHOps <noreply@chops>',
    },
    version: {
      clickhouseVersion: process?.env?.CLICKHOUSEVERSION,
      major: process?.env?.MAJOR,
      minor: process?.env?.MINOR,
      patch: process?.env?.PATCH,
      display: process?.env?.DISPLAY,
      version: process?.env?.VERSION,
      codename: process?.env?.CODENAME,
    },
  };
}
