// notifier-emails.test.js - The account and password reset emails carry the setup link, not a password.
// Copyright (C) 2026 Quantrail Data Private Limited

import { describe, it, expect, mock } from "bun:test";

const sentMails = [];
mock.module("nodemailer", () => ({
  default: {
    createTransport: () => ({
      sendMail: async (mail) => {
        sentMails.push(mail);
      },
    }),
  },
}));
mock.module("../../src/backend/services/clusterUtils.js", () => ({
  getAllClusters: () => [],
}));

const { sendNotification } = await import("../../src/backend/services/notifier.js");

const EMAIL = { type: "email", smtp_host: "smtp.example.com", to: "user@example.com" };
const LINK = "https://chops.example.com/#/set-password?token=abc123";

describe("account emails", () => {
  it("links the setup button of a new account to the setup link", async () => {
    await sendNotification(EMAIL, {
      name: "CHOps Account Created",
      description: "Username: alice\nRole: editor",
      setPasswordUrl: LINK,
    });
    expect(sentMails.at(-1).html).toContain(`href="${LINK}"`);
  });

  it("sends a link, and no password, for a password reset", async () => {
    await sendNotification(EMAIL, {
      name: "CHOps Password Reset",
      description: "Your CHOps password was reset by an administrator.\n\nUsername: alice\nRole: editor",
      setPasswordUrl: LINK,
    });
    const html = sentMails.at(-1).html;
    expect(html).toContain(`href="${LINK}"`);
    expect(html).toContain("Set a New Password");
    expect(html).not.toContain('id="password"');
  });
});
