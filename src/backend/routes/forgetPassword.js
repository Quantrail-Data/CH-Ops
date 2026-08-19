import { Router } from "express";
import { db } from "../db/index";
import { appUsers } from "../db/schema";
import { eq } from "drizzle-orm";
import { issueOTP, verifyOTP, redeemResetToken } from "../services/OTPservice";
import { log } from "../services/logger.js";
import { loadEnv } from "../utils/env";
import { sendOTPEmail } from "../services/notifier";
import { resolveSystemSmtp } from "../services/systemSmtp.js";

const router = Router();

const env = loadEnv();

const GENERIC = {
  success: true,
  message: "If an account exists for that address, a code has been sent.",
};

async function hashPassword(pw) {
  return Bun.password.hash(pw, {
    algorithm: "argon2id",
    memoryCost: 65536,
    timeCost: 2,
  });
}

// verify the mail send the OTP
router.post("/email/verify", async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email || typeof email !== "string")
      return res
        .status(400)
        .json({ success: false, message: "Email is required." });

    const user = findSoleUserByEmail(email);
    if (!user) return res.status(200).json(GENERIC);

    const otp = issueOTP(user.id);
    try {
      await sendOTPEmail(email, otp, resolveSystemSmtp() || {});
    } catch (err) {
      log.error("Password reset email failed:", err?.message || err);
    }
    return res.status(200).json(GENERIC);
  } catch (err) {
    log.error("Password reset request failed:", err?.message || err);
    return res.status(200).json(GENERIC);
  }
});

// verify the otp
router.post("/otp/verify", (req, res) => {
  try {
    const { email, otp } = req.body || {};
    if (!email || !otp)
      return res
        .status(400)
        .json({ success: false, message: "Email and code are required." });

    // One message for every failure. Saying "expired" versus "wrong code"
    // versus "too many attempts" tells an attacker what is happening.
    const fail = { success: false, message: "Invalid or expired code." };

    const user = findSoleUserByEmail(email);
    if (!user) return res.status(400).json(fail);

    const result = verifyOTP(user.id, String(otp));
    if (!result.ok) return res.status(400).json(fail);

    // The proof that this step happened. Step 3 will not work without it.
    return res
      .status(200)
      .json({ success: true, resetToken: result.resetToken });
  } catch (err) {
    log.error("OTP verification failed:", err?.message || err);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error!" });
  }
});

//change the password
router.post("/change/password", async (req, res) => {
  try {
    const { resetToken, password } = req.body || {};
    if (!resetToken || !password)
      return res.status(400).json({
        success: false,
        message: "Reset token and password are required.",
      });

    // The old handler enforced no length at all, unlike the normal password
    // change in controllers/auth.js line 224.
    if (password.length < 8 || password.length > 256) {
      return res.status(400).json({
        success: false,
        message: "Password must be between 8 and 256 characters.",
      });
    }

    // Single use, tied to one account, expires in five minutes. The old
    // handler trusted a flag on a record found by an email address that came
    // from this same request body.
    const userId = redeemResetToken(resetToken);
    if (!userId)
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset token.",
      });

    const newHash = await hashPassword(password);

    // By primary key. The old query was WHERE email = ?, which rewrites every
    // row sharing that address.
    db.update(appUsers)
      .set({ passwordHash: newHash, mustChangePassword: false })
      .where(eq(appUsers.id, userId))
      .run();

    log.info(`Password reset completed for user id ${userId}`);
    return res.status(200).json({
      success: true,
      message: "Password updated. Please sign in.",
    });
  } catch (err) {
    log.error("Password change failed:", err?.message || err);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error!" });
  }
});

function findSoleUserByEmail(email) {
  const matches = db
    .select()
    .from(appUsers)
    .where(eq(appUsers.email, email))
    .all();
  return matches.length === 1 ? matches[0] : null;
}

export default router;
