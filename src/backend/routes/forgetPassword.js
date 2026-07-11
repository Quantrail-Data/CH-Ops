import { Router } from "express";
import { db } from "../db/index";
import { appUsers } from "../db/schema";
import { eq } from "drizzle-orm";
import { deleteOTP, getOTP, setOTP, updateOTP } from "../services/OTPservice";
import { loadEnv } from "../utils/env";
import { sendOTPEmail } from "../services/notifier";

const router = Router();

const env = loadEnv();

async function hashPassword(pw) {
  return Bun.password.hash(pw, {
    algorithm: "argon2id",
    memoryCost: 65536,
    timeCost: 2,
  });
}

// verify the mail send the OTP
router.post("/email/verify", (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email)
      return res?.status(403)?.json({
        success: false,
        message: "Email is required to complete this request.",
      });

    // find the user is there and valid
    const isFind = db
      .select()
      .from(appUsers)
      .where(eq(appUsers.email, email))
      .get();

    if (!isFind)
      return res?.status(403)?.json({
        sucess: false,
        message:
          "Invalid user. No account is associated with this email address",
      });

    // already is there it will delete the user otp details
    deleteOTP(email);
    // create the otp details for that user
    const otp = setOTP(email, isFind?.passwordHash);
    const smptConfig = env?.smtp || {};

    const isSend = sendOTPEmail(email, otp, smptConfig);

    if (!isSend)
      return res
        ?.status(500)
        ?.json({ success: false, message: "Failed to send mail to " + email });

    res.status(201).json({ success: true, message: "done",email });
  } catch (err) {
    return res?.status(500)?.json({success:false,message:"Internal Server Error!"})
  }
});

// verify the otp
router.post("/otp/verify", (req, res, next) => {
  try {
    const { otp, email } = req?.body;
    // console.log(otp,email)
    if (!otp)
      return res
        ?.status(403)
        ?.json({ success: false, message: "OTP field is required." });

    const otpData = getOTP(email);
   
    if (!otpData)
      return res
        ?.status(404)
        ?.json({ success: false, message: "User not found or OTP is invalid" });

    if (Date.now() > otp?.expTime)
      return res?.status(400)?.json({
        success: false,
        message: "OTP has expired. Please request a new OTP.",
      });

    if (otpData?.otp !== otp)
        
      return res?.status(404)?.json({
        success: false,
        message: "OTP verification failed. Invalid OTP.",
      });




    updateOTP(email, { ...otpData, verified: true });


    return res?.status(201)?.json({ success: true, message: "Done" });
  } catch (err) {
    console.log(err)
    return res?.status(500)?.json({success:false,message:"Internal Server Error!"})
  }
});

//change the password
router.post("/change/password", async (req, res, next) => {
  try {
    const { password, email } = req?.body;


    if (!password || !email)
      return res?.status(400)?.json({
        success: false,
        message: "Both email and password are required.",
      });

    const otpVaue = getOTP(email);

    if (!otpVaue)
      return res
        ?.status(404)
        ?.json({ success: false, message: "User not found or OTP is invalid" });

    if (!otpVaue?.verified)
      return res
        ?.status(400)
        ?.json({ success: false, message: "OTP not verified!" });

    const newHash = await hashPassword(password);

    db.update(appUsers)
      .set({ passwordHash: newHash })
      .where(eq(appUsers.email, email))
      .run();

    deleteOTP(email);

    return res?.status(201)?.json({ success: true, message: "done" });

  } catch (err) {
    return res?.status(500)?.json({success:false,message:"Internal Server Error!"})
  }
});

export default router;
