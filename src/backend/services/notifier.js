// notifier.js - Multi-channel alert notification dispatcher
//
// Sends rich notifications to configured channels (email only for now).
// Includes alert details: name, severity, description, SQL, schedule,
// threshold, operator, current value, cluster name, fired node, and
// timestamp. Email uses a styled HTML template with severity colors.
// Webhook URLs are validated to prevent SSRF attacks (no localhost
// or private IPs allowed).
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import nodemailer from "nodemailer";
import { getAllClusters } from "./clusterUtils.js";
import { loadEnv } from "../utils/env.js";

function validateWebhookUrl(url) {
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
  const host = parsed.hostname.toLowerCase();
  // Block localhost
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "0.0.0.0"
  ) {
    throw new Error("Webhook URL cannot point to localhost.");
  }
  // Block private IP ranges, link-local, metadata
  const parts = host.split(".").map(Number);
  if (parts.length === 4 && parts.every((n) => !isNaN(n))) {
    if (parts[0] === 10)
      throw new Error("Webhook URL cannot point to private networks.");
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
      throw new Error("Webhook URL cannot point to private networks.");
    if (parts[0] === 192 && parts[1] === 168)
      throw new Error("Webhook URL cannot point to private networks.");
    if (parts[0] === 169 && parts[1] === 254)
      throw new Error("Webhook URL cannot point to link-local addresses.");
  }
}

function getClusterInfo(alert) {
  const clusters = getAllClusters();
  if (!clusters.length) return { clusterName: "No cluster", nodes: "-" };

  // Find the cluster this alert is assigned to, or fall back to first
  const cluster =
    (alert?.clusterId
      ? clusters.find((c) => c.id === alert.clusterId)
      : null) || clusters[0];
  const clusterName = cluster.name || "Default";

  // If the alert targets specific nodes, show those
  let targetNodes = [];
  try {
    if (alert?.nodes) {
      const parsed =
        typeof alert.nodes === "string" ? JSON.parse(alert.nodes) : alert.nodes;
      if (Array.isArray(parsed) && parsed.length > 0) targetNodes = parsed;
    }
  } catch {}

  if (targetNodes.length) {
    return { clusterName, nodes: targetNodes.join(", ") };
  }
  const allNodes = (cluster.nodes || []).map((n) => n.host);
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

function extractAccountDetails(description) {
  const text = String(description || "")
    .replace(/\s+/g, " ")
    .trim();
  const usernameMatch = text.match(/Username:\s*(.*?)\s+Password:/i);
  const passwordMatch = text.match(/Password:\s*(.*?)\s+Role:/i);
  const roleMatch = text.match(
    /Role:\s*(.*?)\s+(Please change your password on first login\.?)/i,
  );
  const noteMatch = text.match(
    /(Please change your password on first login\.?)/i,
  );

  return {
    intro: text.split(/Username:/i)[0].trim(),
    username: usernameMatch ? usernameMatch[1].trim() : "",
    password: passwordMatch ? passwordMatch[1].trim() : "",
    role: roleMatch ? roleMatch[1].trim() : "",
    note: noteMatch ? noteMatch[1].trim() : "",
  };
}

function extractFirstName(name) {
  if (typeof name !== "string" || !name.trim()) return "User";
  return name.split(" ")[0];
}

export const sendOTPEmail = async (email, otp, channelConfig) => {
  try {
    const config =
      typeof channelConfig === "string"
        ? JSON.parse(channelConfig)
        : channelConfig;

    if (!config) {
      return false
      
    }
    const webAppName = "CHOPS";

    const escapeEmail = escapeHtml(email);
    const escapeOtp = escapeHtml(otp);
    const escapeWebAppName = escapeHtml(webAppName);

    const mailOptions = {
      from: config?.from,
      to: email,
      subject: "Password Reset OTP",
      text: `Hi ${escapeEmail},\n\nHere is your OTP (One Time PIN) for resetting your password on ${escapeWebAppName}:\n\nOTP: ${escapeOtp}\n\nThis OTP is valid for 30 seconds.`,
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
            
            <p style="color: #666; font-size: 14px;">This OTP is valid for <strong>30 seconds</strong>. Please do not share it with anyone.</p>
            
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
      secure: config.secure === "true",
      auth: config.user
        ? { user: config.user, pass: config.pass }
        : undefined,
    });

    const info = await transport.sendMail(mailOptions);
     console.log("Password reset OTP sent to %s: %s", email, info.messageId);
    return true;
  } catch (error) {
    console.error("Error sending OTP email:", error.message);
    return false;
  }
};

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
      secure: config.smtp_secure === "true",
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
    const containerBg = "#ffffff";
    const bodyColor = "#0b1220";
    const containerBorder = "rgba(15,23,42,0.06)";
    const rowBorder = "rgba(15,23,42,0.06)";
    const preColor = "#ffffff";
    const tableTextColor = "#0b1220";
    const severityTextColor = d.severity === "WARNING" ? "#1a1a2e" : "#fff";
    const mutedTextColor = "#64748b";

    const env = loadEnv();

    const accountDetails = isAccountEmail
      ? extractAccountDetails(d.description)
      : null;

    const descriptionHtml = d.description !== "-"
        ? `<p style="color:#334155;margin:0 0 16px;font-size:15px;line-height:1.7">${escapeHtml(d.description)}</p>`
        : "";

    const html = isAccountEmail ? `
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
                                            Welcome! Your Account Is Ready
                                        </h1>

                                        <p
                                            style="margin:0 0 25px;font-size:13px;line-height:30px;color:#3a3a3a;font-family:Arial,sans-serif;">
                                            <strong>Hi, ${escapeHtml(accountDetails?.username || "-")}</strong><br>
                                            Welcome to CH-OPS!<br>
                                            Please click the button below to log in to CH-OPS.
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
                                                    ${escapeHtml(accountDetails?.username || "-")}
                                                </td>
                                            </tr>

                                            <tr>
                                                <td
                                                    style="padding:12px 16px;font-weight:600;color:#000;">
                                                    Password
                                                </td>

                                                <td id="password"
                                                    style="padding:12px 16px;font-family:monospace;word-break:break-all;color:#000;">
                                                    ${escapeHtml(accountDetails?.password || "-")}
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

                                    <table role="presentation" cellpadding="0" cellspacing="0" border="0"
                                        align="center" style="margin:18px auto;">
                                        <tr>
                                            <td bgcolor="#8a2be2" align="center" style="border-radius:6px;">
                                                <a href="${env.frontendLink}" target="_blank"
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
                                                    Login
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
    ` :
    `<div style="font-family:'Jakarta Sans',system-ui,sans-serif;max-width:640px;margin:0 auto;border:1px solid ${containerBorder};border-radius:12px;overflow:hidden;background:${containerBg}">
      <div style="background:linear-gradient(135deg,#8b5cf6,#6366f1);color:white;padding:18px 24px"><h2 style="margin:0;font-size:20px">${escapeHtml(d.severity)}: ${escapeHtml(d.name)}</h2><p style="margin:4px 0 0;opacity:0.85;font-size:13px">${escapeHtml(d.timestamp)}</p></div>
      <div style="padding:24px;color:${bodyColor}">
        ${descriptionHtml}
        <div style="border:1px solid ${rowBorder};border-radius:10px;overflow:hidden;background:#ffffff">
          <div style="padding:12px 16px;background:#f8fafc;color:#0f172a;font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase">Alert Summary</div>
          <table style="width:100%;font-size:14px;border-collapse:collapse;color:${tableTextColor}">
            ${d.kind === 'failure'
              ? `<tr><td style="padding:10px 16px;color:#64748b;width:140px;border-bottom:1px solid ${rowBorder}">Error</td><td style="padding:10px 16px;font-weight:600;color:#b91c1c;border-bottom:1px solid ${rowBorder};font-family:monospace;word-break:break-all">${escapeHtml(d.error || 'Evaluation failed')}</td></tr>`
              : d.kind === 'recovery'
              ? `<tr><td style="padding:10px 16px;color:#64748b;width:140px;border-bottom:1px solid ${rowBorder}">Status</td><td style="padding:10px 16px;font-weight:600;color:#15803d;border-bottom:1px solid ${rowBorder}">Recovered - evaluation succeeded again</td></tr>`
              : `<tr><td style="padding:10px 16px;color:#64748b;width:140px;border-bottom:1px solid ${rowBorder}">Value</td><td style="padding:10px 16px;font-weight:600;color:${tableTextColor};border-bottom:1px solid ${rowBorder}">${escapeHtml(d.value)}</td></tr>
                 <tr><td style="padding:10px 16px;color:#64748b;border-bottom:1px solid ${rowBorder}">Threshold</td><td style="padding:10px 16px;color:${tableTextColor};border-bottom:1px solid ${rowBorder}">${escapeHtml(d.operator)} ${escapeHtml(d.threshold)}</td></tr>`}
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
      subject: `[CHOps] ${d.severity}: ${d.name}`,
      html,
      attachments:isAccountEmail ?  [
        {
          filename: "logo.png",
          path: "src/frontend/assets/chops-dark.png",
          cid: "logo-image-123",
        },
      ]: [],
    });
  }
}

export async function testChannel(config) {
  const testAlert = {
    name: "Test Alert",
    severity: "info",
    description: "This is a test notification from CHOps.",
    sql: "SELECT 1",
    schedule: "*/5 * * * *",
    operator: "gt",
    threshold: 0,
    lastValue: 1,
    lastRunAt: new Date().toISOString(),
  };
  await sendNotification(config, testAlert);
}
