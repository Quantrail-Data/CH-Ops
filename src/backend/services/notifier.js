// notifier.js - Multi-channel alert notification dispatcher
// Sends rich notifications to configured channels (email only for now).
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import dns from "node:dns";
import net from "node:net";
import nodemailer from "nodemailer";
import { getAllClusters } from "./clusterUtils.js";
import { OTP_TTL_MS } from "./OTPservice.js";
import { postJsonToAddress } from "./webhookPost.js";

// The channel types that sendNotification knows.
export const CHANNEL_TYPES = ["email", "slack", "google_chat", "teams", "pagerduty"];

// Address ranges that a webhook must not reach: this server, private networks and special ranges.
const BLOCKED_ADDRESS_RANGES = [
  ["0.0.0.0", 8, "ipv4"], // "This network", with the unspecified address 0.0.0.0
  ["10.0.0.0", 8, "ipv4"], // Private
  ["100.64.0.0", 10, "ipv4"], // Carrier-grade NAT (CGNAT)
  ["127.0.0.0", 8, "ipv4"], // Loopback
  ["169.254.0.0", 16, "ipv4"], // Link-local, with cloud metadata 169.254.169.254
  ["172.16.0.0", 12, "ipv4"], // Private
  ["192.168.0.0", 16, "ipv4"], // Private
  ["224.0.0.0", 4, "ipv4"], // Multicast
  ["240.0.0.0", 4, "ipv4"], // Reserved, with the broadcast address 255.255.255.255
  ["::", 128, "ipv6"], // Unspecified
  ["::1", 128, "ipv6"], // Loopback
  ["::ffff:0:0", 96, "ipv6"], // IPv4-mapped IPv6
  ["fc00::", 7, "ipv6"], // Unique local (ULA)
  ["fe80::", 10, "ipv6"], // Link-local
  ["ff00::", 8, "ipv6"], // Multicast
];

// One list for each family. In Bun, one shared list matches IPv4 addresses against the IPv4-mapped range.
const blockedIpv4 = new net.BlockList();
const blockedIpv6 = new net.BlockList();
for (const [address, prefix, family] of BLOCKED_ADDRESS_RANGES) {
  const list = family === "ipv4" ? blockedIpv4 : blockedIpv6;
  list.addSubnet(address, prefix, family);
}

// True when a webhook must not send to this address. A text that is not an IP address is blocked too.
export function isBlockedAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return blockedIpv4.check(address, "ipv4");
  if (family === 6) return blockedIpv6.check(address, "ipv6");
  return true;
}

async function lookupAllAddresses(hostName) {
  const results = await dns.promises.lookup(hostName, { all: true });
  return results.map((result) => result.address);
}

// Refuses a webhook URL that is not HTTPS, or whose host is, or resolves to, a blocked address.
// Returns the checked IP address. The send connects to this address (see webhookPost.js).
// allowUnresolvedName lets a host name that does not resolve now pass, and returns null.
// The channel form uses it. The send does not use it, so the send checks the name again.
export async function validateWebhookUrl(
  url,
  { lookupAddresses = lookupAllAddresses, allowUnresolvedName = false } = {},
) {
  if (!url || typeof url !== "string")
    throw new Error("Webhook URL is required.");
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid webhook URL format.");
  }
  if (parsed.protocol !== "https:")
    throw new Error("Webhook URL must use HTTPS.");

  // An IPv6 host name has brackets, for example "[::1]". A trailing dot is allowed in DNS names.
  const host = parsed.hostname
    .toLowerCase()
    .replace(/^\[(.*)\]$/, "$1")
    .replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost")) {
    throw new Error("Webhook URL cannot point to localhost.");
  }
  if (net.isIP(host)) {
    if (isBlockedAddress(host)) {
      throw new Error(
        `Webhook URL cannot point to localhost, private networks, link-local or special addresses: ${host}`,
      );
    }
    return host;
  }

  let addresses = [];
  try {
    addresses = await lookupAddresses(host);
  } catch {
    addresses = [];
  }
  if (addresses.length === 0) {
    if (allowUnresolvedName) return null;
    throw new Error(`Webhook host name does not resolve: ${host}`);
  }
  const blockedAddress = addresses.find(isBlockedAddress);
  if (blockedAddress) {
    throw new Error(
      `Webhook URL cannot point to localhost, private networks, link-local or special addresses: ${host} resolves to ${blockedAddress}`,
    );
  }
  return addresses[0];
}

// The cluster name in a message. A rule with no cluster runs on the first cluster,
// and the message says so.
function getClusterInfo(alert) {
  const clusters = getAllClusters();
  if (!clusters.length) return { clusterName: "No cluster", nodes: "-" };

  let cluster;
  let clusterName;
  if (alert?.clusterId) {
    cluster = clusters.find((c) => c.id === alert.clusterId);
    clusterName = cluster
      ? cluster.name || "Default"
      : `Unknown cluster (${alert.clusterId})`;
  } else {
    cluster = clusters[0];
    clusterName = `No cluster set (first cluster used: ${cluster.name || "Default"})`;
  }

  // If the alert targets specific nodes, show those
  let targetNodes = [];
  try {
    if (alert?.nodes) {
      const parsed =
        typeof alert.nodes === "string" ? JSON.parse(alert.nodes) : alert.nodes;
      if (Array.isArray(parsed) && parsed.length > 0) targetNodes = parsed;
    }
  } catch {
    // Keep the default nodes.
  }

  if (targetNodes.length) {
    return { clusterName, nodes: targetNodes.join(", ") };
  }
  const allNodes = (cluster?.nodes || []).map((n) => n.host);
  return { clusterName, nodes: allNodes.join(", ") || "all nodes" };
}

function formatDetails(alert) {
  const d = alert.lastRunAt ? new Date(alert.lastRunAt) : new Date();
  const ts = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  const info = getClusterInfo(alert);
  return {
    name: alert.name,
    severity: (alert.severity || "info").toUpperCase(),
    description: alert.description || "-",
    sql: alert.sql || "-",
    schedule: alert.schedule || "-",
    operator: alert.operator || "gt",
    threshold: alert.threshold,
    value: alert.lastValue ?? "?",
    clusterName: info.clusterName,
    nodes: info.nodes,
    firedNode: alert.firedNode || "-",
    timestamp: ts,
    kind: alert.kind || "breach",
    error: alert.error || null,
    // The one-time link of the account and password reset emails.
    setPasswordUrl: alert.setPasswordUrl || "",
    // The account of the account and password reset emails: { username, role }.
    account: alert.account || null,
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const sendOTPEmail = async (email, otp, channelConfig) => {
  try {
    const otpValidityMinutes = OTP_TTL_MS / (60 * 1000);
    const config =
      typeof channelConfig === "string"
        ? JSON.parse(channelConfig)
        : channelConfig;

    if (!config) {
      return false;
    }
    const webAppName = "CHOPS";

    const escapeEmail = escapeHtml(email);
    const escapeOtp = escapeHtml(otp);
    const escapeWebAppName = escapeHtml(webAppName);

    const mailOptions = {
      from: config?.from,
      to: email,
      subject: "Password Reset OTP",
      text: `Hi ${escapeEmail},\n\nHere is your OTP (One Time PIN) for resetting your password on ${escapeWebAppName}:\n\nOTP: ${escapeOtp}\n\nThis OTP is valid for ${otpValidityMinutes} minutes.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <div style="background: linear-gradient(135deg, #5D3FD3, #8B5CF6); padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0;">Password Reset OTP</h1>
          </div>
          <div style="padding: 25px; background: #ffffffff; border-radius: 0 0 10px 10px; border: 1px solid #e0e0e0;">
            <p>Hi ${escapeEmail},</p>
            <p>You requested to reset your password. Here is your OTP (One Time PIN):</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <div style="display: inline-block; background: #5D3FD3; color: white; font-size: 24px; font-weight: bold; letter-spacing: 5px; padding: 15px 25px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                ${escapeOtp}
              </div>
            </div>
            
            <p style="color: #666; font-size: 14px;">This OTP is valid for <strong> ${otpValidityMinutes} minutes </strong>. Please do not share it with anyone.</p>
            
            <p>If you didn't request this password reset, please ignore this email or contact our support team immediately.</p>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
              <p style="color: #666; font-size: 14px;">Best regards,<br>The ${escapeWebAppName} Team</p>
            </div>
          </div>
        </div>
      `,
    };

    const transport = nodemailer.createTransport({
      host: config.host,
      port: parseInt(config.port) || 587,
      secure: config.secure === true || config.secure === "true",
      auth: config.user ? { user: config.user, pass: config.pass } : undefined,
    });

    await transport.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error("Error sending OTP email:", error.message);
    return false;
  }
};

// Throws when a notification service refuses the message, so the failure shows in the channel status.
// Slack answers 200 also when it refuses a message, with ok: false in the body.
// A redirect is a failure too. The send does not follow it, because it can lead to a private address.
async function throwIfRefused(response, serviceName) {
  const isRedirect =
    response.type === "opaqueredirect" ||
    (response.status >= 300 && response.status < 400);
  if (isRedirect) {
    throw new Error(
      `${serviceName} answered with a redirect (HTTP ${response.status}). CHOps does not follow redirects.`,
    );
  }
  if (!response.ok) {
    throw new Error(`${serviceName} refused the message: HTTP ${response.status}`);
  }
  if (serviceName === "Slack") {
    const slackResult = await response.json().catch(() => ({}));
    if (!slackResult.ok) {
      throw new Error(
        `Slack refused the message: ${slackResult.error || "unknown error"}`,
      );
    }
  }
}

export async function sendNotification(channelConfig, alert) {
  const config =
    typeof channelConfig === "string"
      ? JSON.parse(channelConfig)
      : channelConfig;
  const d = formatDetails(alert);

  if (config.type === "email") {
    if (!config.smtp_host) throw new Error("SMTP host is not configured");
    if (!config.to) throw new Error("Recipient email is not configured");
    const transport = nodemailer.createTransport({
      host: config.smtp_host,
      port: parseInt(config.smtp_port) || 587,
      secure: config.smtp_secure === true || config.smtp_secure === "true",
      auth: config.smtp_user
        ? { user: config.smtp_user, pass: config.smtp_pass }
        : undefined,
    });
    const sevColor =
      d.severity === "CRITICAL"
        ? "#f87171"
        : d.severity === "WARNING"
          ? "#fbbf24"
          : "#8b5cf6";

    const isAccountEmail = /account created/i.test(d.name || "");
    const isPasswordResetEmail = /password reset/i.test(d.name || "");
    const containerBg = "#ffffff";
    const bodyColor = "#0b1220";
    const containerBorder = "rgba(15,23,42,0.06)";
    const rowBorder = "rgba(15,23,42,0.06)";
    const preColor = "#ffffff";
    const tableTextColor = "#0b1220";
    const severityTextColor = d.severity === "WARNING" ? "#1a1a2e" : "#fff";

    const accountDetails = isAccountEmail ? d.account : null;
    const passwordResetDetails = isPasswordResetEmail ? d.account : null;

    const descriptionHtml =
      d.description !== "-"
        ? `<p style="color:#334155;margin:0 0 16px;font-size:15px;line-height:1.7">${escapeHtml(d.description)}</p>`
        : "";

    const html = isAccountEmail
      ? `
 <!DOCTYPE html>

<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome Email</title>
</head>

<body
    style="margin:0;padding:0;background-color:#e6e6e620;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
    style="background:#e6e6e620;padding:40px 0;">
    <tr>
        <td align="center">

            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600"
                style="width:600px;max-width:600px;background:#e6e6e620;border-radius:5px;box-shadow:0 0 40px #d6d6d6;font-family:system-ui,-apple-system,sans-serif;">

                <tr>
                    <td align="center" style="padding:25px 20px;">
                        <img src="cid:logo-image-123" alt="Company Logo" width="250"
                            style="display:block;border:0;max-width:250px;width:100%;pointer-events:none;">
                    </td>
                </tr>

                <tr>
                    <td align="center">

                        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="85%"
                            style="background:#ffffff;border-radius:5px;">

                            <tr>
                                <td style="padding:30px;">

                                    <h1
                                        style="margin:0 0 20px;font-size:24px;font-family:'Gill Sans','Gill Sans MT',Calibri,sans-serif;color:#440088;font-weight:700;">
                                        Welcome! Your Account Is Ready
                                    </h1>

                                    <p
                                        style="margin:0 0 25px;font-size:13px;line-height:30px;color:#3a3a3a;font-family:Arial,sans-serif;">
                                        <strong>Hi, ${escapeHtml(accountDetails?.username || "-")}</strong><br>
                                        Welcome to CH-OPS!<br>
                                        Your account has been created successfully. Please use the button below
                                        to set your password and activate your account.
                                    </p>

                                    <!-- Account Details -->
                                    <table width="100%" cellpadding="0" cellspacing="0"
                                        style="border-collapse:collapse;font-size:14px;color:#000;margin:20px 0;">

                                        <tr>
                                            <td width="140"
                                                style="padding:12px 16px;font-weight:600;color:#000;">
                                                Username
                                            </td>

                                            <td
                                                style="padding:12px 16px;font-family:monospace;word-break:break-all;color:#000;">
                                                ${escapeHtml(accountDetails?.username || "-")}
                                            </td>
                                        </tr>

                                        <tr>
                                            <td
                                                style="padding:12px 16px;font-weight:600;color:#000;">
                                                Role
                                            </td>

                                            <td style="padding:12px 16px;color:#000;">
                                                ${escapeHtml(accountDetails?.role || "-")}
                                            </td>
                                        </tr>

                                    </table>

                                    <!-- One-Time Setup Button -->
                                    <table role="presentation" cellpadding="0" cellspacing="0" border="0"
                                        align="center" style="margin:18px auto;">
                                        <tr>
                                            <td bgcolor="#8a2be2" align="center" style="border-radius:6px;">
                                                <a href="${escapeHtml(d.setPasswordUrl)}" target="_blank"
                                                    style="
                                                        display:inline-block;
                                                        padding:10px 19px;
                                                        font-size:15px;
                                                        font-family:Arial,sans-serif;
                                                        font-weight:700;
                                                        color:#ffffff;
                                                        text-decoration:none;
                                                        border:1px solid #8a2be2;
                                                        border-radius:6px;
                                                        line-height:1;
                                                    ">
                                                    Set Up Your Password
                                                </a>
                                            </td>
                                        </tr>
                                    </table>

                                    <p
                                        style="margin:20px 0 0;font-size:12px;line-height:20px;color:#777;font-family:Arial,sans-serif;text-align:center;">
                                        This is a one-time setup link. Please use it to create your password
                                        before logging in to CH-OPS.
                                    </p>

                                </td>
                            </tr>

                        </table>

                    </td>
                </tr>

                <tr>
                    <td align="center"
                        style="padding:30px 20px;font-size:12px;font-family:Arial,sans-serif;color:#808080;">

                        <p style="margin:0 0 10px;">
                            Visit our official website to explore our services, products, and latest updates.
                        </p>

                        <a href="https://www.ch-ops.io/"
                            style="color:#8a2be2;text-decoration:none;font-weight:600;">
                            Learn more
                        </a>

                    </td>
                </tr>

            </table>

        </td>
    </tr>
</table>

</body>

</html>

    `
      : isPasswordResetEmail
        ? `
<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Password Reset</title>
</head>

<body
    style="margin:0;padding:0;background-color:#e6e6e620;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
        style="background:#e6e6e620;padding:40px 0;">
        <tr>
            <td align="center">


                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600"
                    style="width:600px;max-width:600px;background:#e6e6e620;border-radius:5px;box-shadow:0 0 40px #d6d6d6;font-family:system-ui,-apple-system,sans-serif;">


                    <tr>
                        <td align="center" style="padding:25px 20px;">
                            <img src="cid:logo-image-123" alt="Company Logo" width="250"
                                style="display:block;border:0;max-width:250px;width:100%; pointer-events:none;">
                        </td>
                    </tr>


                    <tr>
                        <td align="center">

                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="85%"
                                style="background:#ffffff;border-radius:5px;">

                                <tr>
                                    <td style="padding:30px;">

                                        <h1
                                            style="margin:0 0 20px;font-size:24px;font-family:'Gill Sans','Gill Sans MT',Calibri,sans-serif;color:#440088;font-weight:700;">
                                            Password Reset
                                        </h1>

                                        <p
                                            style="margin:0 0 25px;font-size:13px;line-height:30px;color:#3a3a3a;font-family:Arial,sans-serif;">
                                            <strong>Hi, ${escapeHtml(passwordResetDetails?.username || "-")}</strong><br>
                                            Your CH-OPS account password has been reset by an administrator.<br>
                                            Please use the button below to set a new password.
                                        </p>

                                        <!-- Details -->
                                        <table width="100%" cellpadding="0" cellspacing="0"
                                            style="border-collapse:collapse;font-size:14px;color:#000;margin:20px 0;">

                                            <tr>
                                                <td width="140"
                                                    style="padding:12px 16px;font-weight:600;color:#000;">
                                                    Username
                                                </td>

                                                <td id="username"
                                                    style="padding:12px 16px;font-family:monospace;word-break:break-all;color:#000;">
                                                    ${escapeHtml(passwordResetDetails?.username || "-")}
                                                </td>
                                            </tr>

                                            <tr>
                                                <td
                                                    style="padding:12px 16px;font-weight:600;color:#000;">
                                                    Role
                                                </td>

                                                <td style="padding:12px 16px;color:#000;">
                                                    ${escapeHtml(passwordResetDetails?.role || "-")}
                                                </td>
                                            </tr>

                                        </table>

                                        <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:12px 16px;margin:16px 0;border-radius:4px;">
                                            <p style="margin:0;font-size:13px;color:#78350f;">
                                                <strong>Important:</strong> The link works one time only, and expires in 30 minutes.
                                            </p>
                                        </div>

                                    <table role="presentation" cellpadding="0" cellspacing="0" border="0"
                                        align="center" style="margin:18px auto;">
                                        <tr>
                                            <td bgcolor="#8a2be2" align="center" style="border-radius:6px;">
                                                <a href="${escapeHtml(d.setPasswordUrl)}" target="_blank"
                                                    style="
                                                        display:inline-block;
                                                        padding:10px 19px;
                                                        font-size:15px;
                                                        font-family:Arial,sans-serif;
                                                        font-weight:700;
                                                        color:#ffffff;
                                                        text-decoration:none;
                                                        border:1px solid #8a2be2;
                                                        border-radius:6px;
                                                        line-height:1;
                                                    ">
                                                    Set a New Password
                                                </a>
                                            </td>
                                        </tr>
                                    </table>

                                    </td>
                                </tr>

                            </table>

                        </td>
                    </tr>

                    <tr>
                        <td align="center"
                            style="padding:30px 20px;font-size:12px;font-family:Arial,sans-serif;color:#808080;">

                            <p style="margin:0 0 10px;">
                                If you didn't request this password reset, please contact your system administrator immediately.
                            </p>

                            <a href="https://www.ch-ops.io/" 
                                style="color:#8a2be2;text-decoration:none;font-weight:600;">
                                Learn more
                            </a>

                        </td>
                    </tr>

                </table>

            </td>
        </tr>
    </table>

</body>

</html>
    `
        : `<div style="font-family:'Jakarta Sans',system-ui,sans-serif;max-width:640px;margin:0 auto;border:1px solid ${containerBorder};border-radius:12px;overflow:hidden;background:${containerBg}">
      <div style="background:linear-gradient(135deg,#8b5cf6,#6366f1);color:white;padding:18px 24px"><h2 style="margin:0;font-size:20px">${escapeHtml(d.severity)}: ${escapeHtml(d.name)}</h2><p style="margin:4px 0 0;opacity:0.85;font-size:13px">${escapeHtml(d.timestamp)}</p></div>
      <div style="padding:24px;color:${bodyColor}">
        ${descriptionHtml}
        <div style="border:1px solid ${rowBorder};border-radius:10px;overflow:hidden;background:#ffffff">
          <div style="padding:12px 16px;background:#f8fafc;color:#0f172a;font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase">Alert Summary</div>
          <table style="width:100%;font-size:14px;border-collapse:collapse;color:${tableTextColor}">
            ${
              d.kind === "failure"
                ? `<tr><td style="padding:10px 16px;color:#64748b;width:140px;border-bottom:1px solid ${rowBorder}">Error</td><td style="padding:10px 16px;font-weight:600;color:#b91c1c;border-bottom:1px solid ${rowBorder};font-family:monospace;word-break:break-all">${escapeHtml(d.error || "Evaluation failed")}</td></tr>`
                : d.kind === "recovery"
                  ? `<tr><td style="padding:10px 16px;color:#64748b;width:140px;border-bottom:1px solid ${rowBorder}">Status</td><td style="padding:10px 16px;font-weight:600;color:#15803d;border-bottom:1px solid ${rowBorder}">Recovered - evaluation succeeded again</td></tr>`
                  : `<tr><td style="padding:10px 16px;color:#64748b;width:140px;border-bottom:1px solid ${rowBorder}">Value</td><td style="padding:10px 16px;font-weight:600;color:${tableTextColor};border-bottom:1px solid ${rowBorder}">${escapeHtml(d.value)}</td></tr>
                 <tr><td style="padding:10px 16px;color:#64748b;border-bottom:1px solid ${rowBorder}">Threshold</td><td style="padding:10px 16px;color:${tableTextColor};border-bottom:1px solid ${rowBorder}">${escapeHtml(d.operator)} ${escapeHtml(d.threshold)}</td></tr>`
            }
            <tr><td style="padding:10px 16px;color:#64748b;border-bottom:1px solid ${rowBorder}">Severity</td><td style="padding:10px 16px;border-bottom:1px solid ${rowBorder}"><span style="background:${sevColor};color:${severityTextColor};padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600">${escapeHtml(d.severity)}</span></td></tr>
            <tr><td style="padding:10px 16px;color:#64748b;border-bottom:1px solid ${rowBorder}">Schedule</td><td style="padding:10px 16px;color:${tableTextColor};border-bottom:1px solid ${rowBorder};font-family:monospace">${escapeHtml(d.schedule)}</td></tr>
            <tr><td style="padding:10px 16px;color:#64748b;border-bottom:1px solid ${rowBorder}">Cluster</td><td style="padding:10px 16px;color:${tableTextColor};border-bottom:1px solid ${rowBorder}">${escapeHtml(d.clusterName)}</td></tr>
            <tr><td style="padding:10px 16px;color:#64748b;border-bottom:1px solid ${rowBorder}">Node</td><td style="padding:10px 16px;font-weight:600;color:${tableTextColor};border-bottom:1px solid ${rowBorder};font-family:monospace">${escapeHtml(d.firedNode)}</td></tr>
            <tr><td style="padding:10px 16px;color:#64748b">Checked At</td><td style="padding:10px 16px;color:${tableTextColor}">${escapeHtml(d.timestamp)}</td></tr>
          </table>
        </div>
        <div style="margin:16px 0 0;padding:12px;background:#000000;border-radius:8px;border:1px solid rgba(0,0,0,0.2)"><div style="font-size:11px;color:#cbd5e1;text-transform:uppercase;margin-bottom:4px">Alert SQL</div><pre style="margin:0;font-family:'Fira Code',monospace;font-size:12px;color:${preColor};white-space:pre-wrap;word-break:break-all;background:transparent">${escapeHtml(d.sql)}</pre></div>
        <p style="color:#94a3b8;font-size:11px;margin:16px 0 0;text-align:center">CHOps Alert Engine - Quantrail™ Data</p>
      </div></div>`;

    await transport.sendMail({
      from: config.from || "CHOps <noreply@chops>",
      to: config.to,
      subject: isPasswordResetEmail
        ? `[CHOps] Password Reset for ${passwordResetDetails?.username || "User"}`
        : isAccountEmail
          ? `[CHOps] Welcome! Your Account Is Ready`
          : `[CHOps] ${d.severity}: ${d.name}`,
      html,
      attachments:
        isAccountEmail || isPasswordResetEmail
          ? [
              {
                filename: "logo.png",
                path: "src/frontend/assets/chops-dark.png",
                cid: "logo-image-123",
              },
            ]
          : [],
    });
  } else if (config.type === "slack") {
    if (!config.bot_token) throw new Error("Slack bot_token is not configured");
    if (!config.channel_id)
      throw new Error("Slack channel_id is not configured");
    const slackResponse = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.bot_token}`,
      },
      body: JSON.stringify({
        channel: config.channel_id,
        attachments: [
          {
            color:
              d.kind === "recovery"
                ? "#16a34a"
                : d.kind === "failure"
                  ? "#dc2626"
                  : "#2563eb",

            blocks: [
              {
                type: "header",
                text: {
                  type: "plain_text",
                  text: `${d.severity.toUpperCase()}: ${d.name.toUpperCase()}`,
                },
              },
              {
                type: "section",
                fields: [
                  ...(d.kind === "failure"
                    ? [{ type: "mrkdwn", text: `*Error:* ${d.error}` }]
                    : d.kind === "recovery"
                      ? [
                          {
                            type: "mrkdwn",
                            text: `*Status:* Recovered - evaluation succeeded again`,
                          },
                        ]
                      : [{ type: "mrkdwn", text: `*Value:* ${d.value}` }]),
                  { type: "mrkdwn", text: `*Severity:* ${d.severity}` },
                  { type: "mrkdwn", text: `*Cluster:* ${d.clusterName}` },
                  { type: "mrkdwn", text: `*Node:* \`${d.firedNode}\`` },
                  { type: "mrkdwn", text: `*Time:* ${d.timestamp}` },
                ],
              },
              ...(d.description !== "-"
                ? [
                    {
                      type: "section",
                      text: {
                        type: "mrkdwn",
                        text: `*Description:* ${d.description}`,
                      },
                    },
                  ]
                : []),
            ],
          },
        ],
      }),
    });
    await throwIfRefused(slackResponse, "Slack");
  } else if (config.type === "google_chat") {
    if (!config.webhook_url)
      throw new Error("Google Chat webhook_url is not configured");
    const checkedAddress = await validateWebhookUrl(config.webhook_url);
    let statusText = "";

    if (d.kind === "failure") {
      statusText = `<font color="#FF0000"><b>Error:</b> ${d.error || "Evaluation failed"}</font>`;
    } else if (d.kind === "recovery") {
      statusText =
        '<font color="#16a34a"><b>Status:</b>Recovered - evaluation succeeded again</font>';
    } else {
      statusText = `<b>Value:</b> ${String(d.value)}`;
    }

    const googleChatResponse = await postJsonToAddress(config.webhook_url, checkedAddress, {
        cardsV2: [
          {
            cardId: "alertCard",
            card: {
              header: {
                title: `${d.severity.toUpperCase()}: ${d.name.toUpperCase()}`,
                subtitle: d.timestamp,
              },
              sections: [
                {
                  widgets: [
                    {
                      decoratedText: {
                        topLabel: "Alert Details",
                        text: statusText,
                      },
                    },
                    {
                      decoratedText: {
                        text: `<b>Severity:</b> ${d.severity}`,
                      },
                    },
                    {
                      decoratedText: {
                        text: `<b>Cluster:</b> ${d.clusterName}`,
                      },
                    },
                    {
                      decoratedText: {
                        text: `<b>Node:</b> ${d.firedNode}`,
                      },
                    },
                    ...(d.description !== "-"
                      ? [
                          {
                            decoratedText: {
                              topLabel: "Description",
                              text: d.description,
                            },
                          },
                        ]
                      : []),
                  ],
                },
              ],
            },
          },
        ],
      });
    await throwIfRefused(googleChatResponse, "Google Chat");
  } else if (config.type === "teams") {
    if (!config.webhook_url)
      throw new Error("Microsoft Teams webhook_url is not configured");
    const checkedAddress = await validateWebhookUrl(config.webhook_url);
    const teamsResponse = await postJsonToAddress(config.webhook_url, checkedAddress, {
        "@type": "MessageCard",
        summary: `${d.severity}: ${d.name}`,
        themeColor:
          d.severity === "CRITICAL"
            ? "dc2626"
            : d.severity === "WARNING"
              ? "d97706"
              : "2563eb",
        sections: [
          {
            activityTitle: `${d.severity}: ${d.name}`,
            activitySubtitle: d.timestamp,
            facts: [
              ...(d.kind === "failure"
                ? [
                    {
                      name: "Status",
                      value: `<span style="color:#dc2626"><b>Error:</b> ${d.error || "Evaluation failed"}</span>`,
                    },
                  ]
                : d.kind === "recovery"
                  ? [
                      {
                        name: "Status",
                        value: `<span style="color:#16a34a"><b>Recovered:</b> Evaluation succeeded again</span>`,
                      },
                    ]
                  : [{ name: "Value", value: String(d.value) }]),

              { name: "Severity", value: d.severity },
              { name: "Cluster", value: d.clusterName },
              { name: "Node", value: d.firedNode },
              ...(d.description !== "-"
                ? [{ name: "Description", value: d.description }]
                : []),
            ],
          },
        ],
      });
    await throwIfRefused(teamsResponse, "Microsoft Teams");
  } else if (config.type === "pagerduty") {
    if (!config.routing_key)
      throw new Error("PagerDuty routing_key is not configured");

    const pagerDutyResponse = await fetch("https://events.pagerduty.com/v2/enqueue", {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        routing_key: config.routing_key,
        // "resolved" closes a breach incident, "recovery" closes a failure incident.
        event_action:
          d.kind === "recovery" || d.kind === "resolved" ? "resolve" : "trigger",
        dedup_key: `chops-${alert.id || d.name}`,
        payload: {
          summary: `[CHOps] ${d.severity}: ${d.name} - value ${d.value}`,
          source: `${d.clusterName} / ${d.firedNode}`,
          severity:
            d.kind === "failure"
              ? "critical"
              : d.kind === "recovery"
                ? "info"
                : "warning",
          custom_details: {
            ...(d.kind === "failure" ? { error: d.error } : {}),
            ...(d.kind === "recovery"
              ? { status: "Evaluation succeeded again" }
              : {}),
            ...(d.kind !== "failure" && d.kind !== "recovery"
              ? { value: d.value }
              : {}),
            description: d.description,
            cluster: d.clusterName,
            node: d.firedNode,
            timestamp: d.timestamp,
          },
        },
      }),
    });
    await throwIfRefused(pagerDutyResponse, "PagerDuty");
  } else {
    throw new Error(`Unknown channel type: ${config.type}`);
  }
}

export async function testChannel(config) {
  const testAlert = {
    name: "Test Alert",
    severity: "info",
    description: "This is a test notification from CHOps.",
    lastValue: 1,
    lastRunAt: new Date().toISOString(),
  };
  await sendNotification(config, testAlert);
}
