// LoginPage - Login Authentication
//
// The entry point for CHOps. The layout follows the Login design
// (Login.dc.html): on the left the product text, the feature chips and the
// screenshot carousel; on the right the sign-in card. Supports
// username/password authentication with loading states and error handling.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { useState, useEffect, useRef } from "react";
import Icon from "../common/Icon.jsx";
import { useAuth, useTheme } from "../../App.jsx";
import { motion } from "motion/react";
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";
import { Autoplay } from "swiper/modules";
import lightScreenshot01 from "../../assets/login-light-01.webp";
import lightScreenshot02 from "../../assets/login-light-02.webp";
import lightScreenshot03 from "../../assets/login-light-03.webp";
import lightScreenshot04 from "../../assets/login-light-04.webp";
import lightScreenshot05 from "../../assets/login-light-05.webp";
import lightScreenshot06 from "../../assets/login-light-06.webp";
import lightScreenshot07 from "../../assets/login-light-07.webp";
import lightScreenshot08 from "../../assets/login-light-08.webp";
import lightScreenshot09 from "../../assets/login-light-09.webp";
import lightScreenshot10 from "../../assets/login-light-10.webp";

import darkScreenshot01 from "../../assets/login-dark-01.webp";
import darkScreenshot02 from "../../assets/login-dark-02.webp";
import darkScreenshot03 from "../../assets/login-dark-03.webp";
import darkScreenshot04 from "../../assets/login-dark-04.webp";
import darkScreenshot05 from "../../assets/login-dark-05.webp";
import darkScreenshot06 from "../../assets/login-dark-06.webp";
import darkScreenshot07 from "../../assets/login-dark-07.webp";
import darkScreenshot08 from "../../assets/login-dark-08.webp";
import darkScreenshot09 from "../../assets/login-dark-09.webp";
import darkScreenshot10 from "../../assets/login-dark-10.webp";

import chopsLightLogo from "../../assets/chops-light.svg";
import chopsDarkLogo from "../../assets/chops-dark.svg";

import OtpInput from "react-otp-input";
import { apiFetch } from "../../utils/api.js";
import { stepsBetween } from "../../utils/carouselSteps.js";
import { useToast } from "./Toast.jsx";
import AppBackground from "./AppBackground.jsx";
import { AnimatedThemeToggler } from "../ui/animated-theme-toggler.jsx";
import { Button, Input, FormField, Notice, PasswordInput } from "../ui/index.jsx";

// After a successful login, ask the browser to save the username and
// password. The form sends the data with JavaScript, so some browsers do not
// see the login on their own. Chrome and Edge have PasswordCredential; in other
// browsers this does nothing, and they use the field names.
async function offerToSavePassword(username, password) {
  if (typeof window === "undefined" || !window.PasswordCredential || !navigator.credentials?.store) return;
  try {
    const credential = new window.PasswordCredential({ id: username, password, name: username });
    await navigator.credentials.store(credential);
  } catch {
    // The browser said no (for example, the user turned off saving). Go on.
  }
}

// The Login page has more particles than the app (component map, 18 Nov).
const LOGIN_PARTICLE_COUNT = 260;

// Feature chips that scroll across the sign-in showcase (style guide).
const FEATURE_CHIPS = [
  "Cluster health",
  "Query profiler",
  "SQL editor",
  "Qurioz AI",
  "Log search",
  "Alert rules",
  "Custom dashboards",
  "Backups and TTL",
];

const swiperDatas = [
  {
    title: "One Tool for Every ClickHouse® Deployment",
    subtitle:
      "Self-hosted, cloud, Kubernetes. CHOps for ClickHouse® connects to all of them from a single interface. Monitor clusters, manage users, debug queries, and investigate incidents without switching tools. The only admin tool that DBAs, SREs, and developers all log into.",
  },
  {
    title: "Your Entire Cluster at a Glance",
    subtitle:
      "Pre-built monitoring dashboards for CPU, memory, disk, merges, network, and replication. Ready the moment you connect. Spot slow queries and kill them with one click. Check table health and storage efficiency instantly. Read and filter server logs directly in the browser, no SQL, no SSH.",
  },
  {
    title: "Debug Any Query. Investigate Any Incident.",
    subtitle:
      'Flame graphs show you exactly why a query is slow. Per-second resource timelines catch the exact moment something went wrong: a memory spike, a cache miss, a disk spill. Playback rewinds your cluster\'s history like a DVR and lets you drill into failed queries and error logs at any point in time. Go from "something broke at 2 AM " to "here\'s the root cause" in minutes.',
  },
  {
    title: "SQL Editor. BI Tool. Dashboards. Built In.",
    subtitle:
      "Write queries with AI assistance, visualize execution plans, save bookmarks, and export results. Build dashboards on your ClickHouse® data without leaving the app. No external BI tools required. Developers ship faster when they don't wait in line for answers.",
  },
  {
    title: "Compare Queries. Estimate Cost Before You Run.",
    subtitle:
      "Run two queries side by side and compare rows, timing, and resource usage at a glance in colored result tables. Estimate a query's cost before you execute it, so the expensive ones never reach production by surprise. Tune with evidence instead of guesswork, right inside the SQL Editor.",
  },
  {
    title: "Ask Qurioz. Get SQL in Seconds.",
    subtitle:
      "Qurioz AI turns plain questions about your data into ready-to-run ClickHouse® SQL, without leaving CHOps. Ask for a query, refine it in conversation, then send it straight to the editor to run. New team members get productive on an unfamiliar schema in minutes, not weeks.",
  },
  {
    title: "Design Tables the Right Way. No Hand-Written DDL.",
    subtitle:
      "Schema Studio walks you through a ClickHouse® table step by step: choose the source, shape each column, pick the engine, and set ORDER BY, PRIMARY KEY, partitioning, data-skipping indexes, and projections through guided forms. It composes correct MergeTree DDL for you, deterministically, and can have AI review the result before anything is created.",
  },
  {
    title: "Access Control. Indexes. Backups. One Interface.",
    subtitle:
      "See who has access to what with a visual grant tree. Create users, roles, and profiles through forms instead of writing DDL. Manage indexes and projections without memorizing ALTER TABLE syntax. Schedule automated backups with configurable retention. The DBA toolkit that should have existed from day one.",
  },
  {
    title: "Alert on Anything. Automate Everything.",
    subtitle:
      "Define alert rules with any SQL condition, a threshold, and a schedule. Rules evaluate per node across the cluster, so problems surface before your users notice. Route notifications to where your team already works: Email, Slack, Google Chat, Microsoft Teams, and PagerDuty. SREs go from zero to production alerts in minutes.",
  },
  {
    title: "Enterprise-Grade. Audit-Proof. Deploy Anywhere.",
    subtitle:
      "Single Sign-On, encrypted server-side credential sessions, and automatic idle sign-out keep access tightly controlled. Tamper-proof audit reports with a live dashboard and verified PDF export keep you audit-ready. Scheduled backups with storage profiles and on-premise deployment give you full data sovereignty. Manage remote clusters across regions from a single place. Your compliance team will actually smile.",
  },
  {
    title: "Actively Developed. Consistently Shipped.",
    subtitle:
      "CHOps for ClickHouse® is built by engineers who work with ClickHouse® in production and feel the same pain you do. Tested and supported on every ClickHouse® LTS release. Fixes shipped fast. Roadmap driven by what operators actually need. We're in this for the long run. Connect your first cluster in under 5 minutes, and learn more at ch-ops.io.",
  },
];

const OTP_Component = ({ setFormStatus }) => {
  const [otp, setOtp] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [min, setMin] = useState(9);
  const [sec, setSec] = useState(59);
  const [status, setStatus] = useState(true);
  const { theme } = useTheme();

  useEffect(() => {
    const timers = setInterval(() => {
      if (sec === 0) {
        if (min >= 1) {
          setMin((prev) => prev - 1);
          setSec(59);
        } else {
          setMin(0);
          setSec(0);
          setStatus(false);
          clearInterval(timers);
          setFormStatus("forget-mail");
          localStorage.removeItem("otp-mail");
        }
      } else {
        status && setSec((prev) => prev - 1);
      }
    }, 1000);

    return () => clearInterval(timers);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Run only when the listed values change, as before.
  }, [sec, min]);

  const OPT_verifyHandle = async (e) => {
    e.preventDefault();
    setLoading(true);
    const email = localStorage?.getItem("otp-mail");
    try {
      const res = await apiFetch("/api/forget-password/otp/verify", {
        method: "POST",
        body: JSON.stringify({
          otp,
          email,
        }),
      });
      if (res?.success) {
        // sessionStorage, not localStorage: this is a credential and it should
        // disappear when the tab closes rather than persist on disk.
        sessionStorage.setItem("otp-reset-token", res.resetToken);
        setFormStatus("forget-change");
      }
    } catch {
      setError(
        "Unable to verify the OTP. It may be invalid, or a server error occurred. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0.2, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: "easeIn" }}
      className="form-conatiner"
    >
      <div className="top-title-login">
        <div
          style={{
            textAlign: "left",
            marginBottom: "30px",
            lineHeight: "30px",
            width: "100%",
          }}
          className="login-title"
        >
          <h4
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-start",
              margin: "0px",
            }}
          >
            Verify your account
          </h4>
          <p>Enter the verification code sent to your email</p>
        </div>
      </div>

      <div style={{ textAlign: "center", marginBottom: "0px" }}></div>
      {error && (
        <Notice tone="danger" icon="ti-alert-circle" style={{ marginBottom: "16px", width: "100%" }}> {error}
        </Notice>
      )}

      <form className="login-form-con" onSubmit={OPT_verifyHandle}>
        <div className="form-group" style={{ marginBottom: "14px" }}>
          {/* <label className="form-label">Email-ID</label> */}
          <OtpInput
            value={otp}
            onChange={setOtp}
            numInputs={6}
            inputType="tel"
            renderSeparator={<span> </span>}
            renderInput={(props) => (
              <input
                {...props}
                style={{
                  width: "40px",
                  height: "40px",
                  margin: "0px 5px",
                  backgroundColor: "transparent",
                  outline: "none",
                  border: "1px solid gray",
                  borderRadius: "10px",
                  color: theme === "dark" ? "white" : "black",
                  textAlign: "center",
                }}
              />
            )}
          />
        </div>

        <div className="form-login-btn">
          <Button
            variant="primary"
            type="submit"
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "45px",
              fontSize: "0.9375rem",
            }}
          >
            {loading ? (
              <>
                <span className="loading-spinner"></span> Sending...
              </>
            ) : (
              <span
                className=""
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "row",
                  gap: "10px",
                }}
              >
                Verify
              </span>
            )}
          </Button>
        </div>

        <Notice tone="info" style={{
            margin: "15px 0px",
            fontSize: "0.6875rem",
            fontWeight: "bold",
            textAlign: "center",
          }}>
          Verification code is going to expire in
          <span
            style={{
              color: min < 2 ? "#ff5454" : theme === "dark" ? "white" : "blue",
            }}
          >
            0{min}:{sec < 10 ? `0${sec}` : sec}
          </span>
        </Notice>
        <div
          style={{
            height: "1px",
            width: "100%",
            backgroundColor: "lightgray",
            margin: "10px 0px",
          }}
        ></div>
        <div
          style={{
            textAlign: "center",
            color: "#ff5454",
            display: "flex",
            alignItems: "center",
            gap: "5px",
            marginTop: "10px",
          }}
        >
          <Icon
            className="ti ti-info-circle"
            style={{ color: "#ff5454", fontSize: "0.8125rem" }}
          />
          <p className="" style={{ fontSize: "0.625rem" }}>
            Do not refresh this page until OTP verification is complete.
          </p>
        </div>
      </form>
    </motion.div>
  );
};

const ChangePasswordComponent = ({ setFormStatus }) => {
  const [passwords, setPasswords] = useState({
    newPassword: null,
    confirmPassword: null,
  });
  // A red border on the confirm field while it does not match.
  const isConfirmMismatch = Boolean(
    passwords?.confirmPassword &&
      passwords?.confirmPassword !== passwords?.newPassword,
  );
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/forget-password/change/password", {
        method: "POST",
        body: JSON.stringify({
          password: passwords?.confirmPassword,
          resetToken: sessionStorage.getItem("otp-reset-token"),
        }),
      });

      if (res?.success) {
        localStorage.removeItem("otp-mail");
        sessionStorage.removeItem("otp-reset-token");
        setFormStatus("login");
      } else {
        setError(res?.message);
      }
    } catch (err) {
      setError(err?.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0.2, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: "easeIn" }}
      className="form-conatiner"
    >
      <div className="top-title-login">
        <div
          style={{
            textAlign: "left",
            marginBottom: "30px",
            lineHeight: "30px",
          }}
          className="login-title"
        >
          <h4
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-start",
              margin: "0px",
            }}
          >
            Login
          </h4>
          <p>Enter your new password and confirm it.</p>
        </div>
      </div>

      <div style={{ textAlign: "center", marginBottom: "0px" }}></div>
      {error && (
        <Notice tone="danger" icon="ti-alert-circle" style={{ marginBottom: "16px", width: "100%" }}> {error}
        </Notice>
      )}

      <form onSubmit={handleSubmit} className="login-form-con">
        <div
          className="form-group "
          style={{ marginBottom: "20px", width: "100%" }}
        >
          <label className="form-label" htmlFor="new-password">New Password</label>
          <PasswordInput id="new-password" autoComplete="new-password" className="tw:h-10" value={passwords?.newPassword} onChange={(e) => setPasswords({ ...passwords, newPassword: e?.target?.value }) } required />
        </div>
        <div
          className="form-group "
          style={{ marginBottom: "20px", width: "100%" }}
        >
          <label className="form-label" htmlFor="confirm-password">Confirm Password</label>
          <PasswordInput
            id="confirm-password"
            autoComplete="new-password"
            className={
              isConfirmMismatch
                ? "tw:h-10 tw:border-[var(--color-danger)]"
                : "tw:h-10"
            }
            aria-invalid={isConfirmMismatch}
            value={passwords?.confirmPassword}
            onChange={(e) =>
              setPasswords({ ...passwords, confirmPassword: e.target.value })
            }
            required
          />
        </div>

        <div className="form-login-btn">
          <Button
            variant="primary"
            type="submit"
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "45px",
              fontSize: "0.9375rem",
            }}
            disabled={
              passwords?.confirmPassword &&
              passwords?.confirmPassword !== passwords?.newPassword
            }
          >
            {loading ? (
              <>
                <span className="loading-spinner"></span> Signing in...
              </>
            ) : (
              <span
                className=""
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "row",
                  gap: "10px",
                }}
              >
                Change Password
              </span>
            )}
          </Button>
        </div>
      </form>
    </motion.div>
  );
};

// animation: marquee-scroll 15s linear infinite;
export default function LoginPage() {
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();

  // The theme changes at once (data-theme), so the animated switch shows the
  // new colors in its circle.
  function changeTheme(nextTheme) {
    document.documentElement.setAttribute("data-theme", nextTheme);
    toggleTheme();
  }
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lightboxSrc, setLightboxSrc] = useState(null);
  // The screenshot that shows, and the feature text under it.
  const [screenshotIndex, setScreenshotIndex] = useState(0);
  const [textIndex, setTextIndex] = useState(0);
  const screenshotSwiperRef = useRef(null);
  const screenshotIndexRef = useRef(0);

  const Toast = useToast();

  const [formStatus, setFormStatus] = useState("login");

  const [verfiyEmail, setVerifyEmail] = useState("");

  useEffect(() => {});

  // Close the enlarged-image preview on Escape while it is open.
  useEffect(() => {
    if (!lightboxSrc) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setLightboxSrc(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxSrc]);

  const lightThemeImages = [
    lightScreenshot01,
    lightScreenshot02,
    lightScreenshot03,
    lightScreenshot04,
    lightScreenshot05,
    lightScreenshot06,
    lightScreenshot07,
    lightScreenshot08,
    lightScreenshot09,
    lightScreenshot10,
  ];
  const darkThemeImages = [
    darkScreenshot01,
    darkScreenshot02,
    darkScreenshot03,
    darkScreenshot04,
    darkScreenshot05,
    darkScreenshot06,
    darkScreenshot07,
    darkScreenshot08,
    darkScreenshot09,
    darkScreenshot10,
  ];
  // Dark screenshots on the dark theme, light screenshots on the light theme.
  const leftImages = theme === "dark" ? darkThemeImages : lightThemeImages;

  // The feature text moves the same number of steps as the screenshots, in
  // the same direction. There are more texts than screenshots, so the texts
  // do not stay with one screenshot; they go through all texts in turn.
  function onScreenshotChange(swiper) {
    const newIndex = swiper.realIndex;
    const steps = stepsBetween(screenshotIndexRef.current, newIndex, leftImages.length);
    screenshotIndexRef.current = newIndex;
    setScreenshotIndex(newIndex);
    setTextIndex((index) => (index + steps + swiperDatas.length) % swiperDatas.length);
  }
  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed");
        setLoading(false);
        return;
      }
      // Not awaited: the login does not wait for the browser prompt.
      offerToSavePassword(username.trim(), password);
      login(data);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }

  async function handleEmailVerifiySubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setPassword("");
    setUsername("");
    try {
      const res = await apiFetch("/api/forget-password/email/verify", {
        method: "POST",
        body: JSON.stringify({ email: verfiyEmail }),
      });
      if (res?.success) {
        localStorage?.setItem("otp-mail", verfiyEmail);
        setFormStatus("forget-otp");
        Toast?.success("OTP generated!");
      }
    } catch {
      setError(
        "Invalid user. No account is associated with this email address",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      {/* Floating 3D particles (Magic UI) behind the whole page. */}
      <AppBackground className="login-background" particleCount={LOGIN_PARTICLE_COUNT} />

      {!lightboxSrc && (
        // The same animated theme switch as in the navbar (Magic UI).
        <AnimatedThemeToggler
          theme={theme}
          onThemeChange={changeTheme}
          duration={450}
          className="login-theme-toggle tw:inline-flex tw:size-8 tw:items-center tw:justify-center tw:rounded-[var(--radius-sm)] tw:border tw:border-[var(--border-strong)] tw:bg-[var(--bg-surface)] tw:text-[var(--text-primary)] tw:hover:bg-[var(--bg-hover)] tw:cursor-pointer"
          title={theme === "dark" ? "Light mode" : "Dark mode"}
          aria-label={theme === "dark" ? "Light mode" : "Dark mode"}
        />
      )}

      {/* Left: what CHOps is, with screenshots. Right: the sign-in card. */}
      {/* Both sides in one group in the middle of the window. */}
      <div className="login-layout">
      <section className="login-showcase" aria-label="About CHOps">
        <div className="login-intro">
          <h1 className="login-headline">
            ClickHouse® Database operations,{" "}
            <span className="login-headline-accent">made easy</span>
          </h1>
          <p className="login-lede">
            One UI to manage, monitor and troubleshoot every ClickHouse®
            database cluster, wherever it runs.
          </p>
          <p className="login-proof">
            <Icon className="ti ti-world-bolt" />
            Powering hundreds of ClickHouse® database installations across
            the globe.
          </p>
          {/* Feature chips move slowly to the left and stop on hover (Magic UI Marquee). */}
          <div className="login-chips" aria-label="CHOps features">
            <div className="login-chips-track">
              {[...FEATURE_CHIPS, ...FEATURE_CHIPS].map((label, index) => (
                <span key={index} className="login-chip" aria-hidden={index >= FEATURE_CHIPS.length ? true : undefined}>
                  <span className="status-dot accent" />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="login-carousel" role="region" aria-roledescription="carousel" aria-label="CHOps screens">
          <div className="login-window">
            <div className="login-window-bar">
              <span className="login-window-dot" />
              <span className="login-window-dot" />
              <span className="login-window-dot" />
              <span className="login-window-title">CHOps preview</span>
            </div>
            <Swiper
              modules={[Autoplay]}
              autoplay={{ delay: 5000, disableOnInteraction: false }}
              loop={true}
              onSwiper={(swiper) => {
                screenshotSwiperRef.current = swiper;
              }}
              onRealIndexChange={onScreenshotChange}
              className="login-window-swiper"
            >
              {leftImages.map((img, idx) => (
                <SwiperSlide key={idx}>
                  <img
                    src={img}
                    loading={idx === 0 ? "eager" : "lazy"}
                    className="login-window-img"
                    alt="CHOps screen"
                    onClick={() => setLightboxSrc(img)}
                  />
                </SwiperSlide>
              ))}
            </Swiper>
          </div>

          <div className="login-carousel-controls">
            <div className="login-carousel-dots">
              {leftImages.map((_, index) => (
                <button
                  key={index}
                  type="button"
                  className={index === screenshotIndex ? "login-carousel-dot active" : "login-carousel-dot"}
                  aria-label={`Show screen ${index + 1}`}
                  aria-current={index === screenshotIndex ? "true" : undefined}
                  onClick={() => screenshotSwiperRef.current?.slideToLoop(index)}
                />
              ))}
            </div>
            <div className="login-carousel-arrows">
              <button
                type="button"
                className="login-carousel-arrow"
                aria-label="Previous screen"
                onClick={() => screenshotSwiperRef.current?.slidePrev()}
              >
                <Icon className="ti ti-chevron-left" />
              </button>
              <button
                type="button"
                className="login-carousel-arrow"
                aria-label="Next screen"
                onClick={() => screenshotSwiperRef.current?.slideNext()}
              >
                <Icon className="ti ti-chevron-right" />
              </button>
            </div>
          </div>

          {/* The feature text moves with the screenshots, also when the user
              clicks an arrow or a dot. */}
          <div key={textIndex} className="login-slide-text" aria-live="polite">
            <h2>{swiperDatas[textIndex]?.title}</h2>
            <p>{swiperDatas[textIndex]?.subtitle}</p>
          </div>
        </div>

        <p className="login-trademark">
          ClickHouse® is a registered trademark of ClickHouse, Inc.
        </p>
      </section>

      <section className="login-form-panel">
        <img
          className="login-brand"
          src={theme === "dark" ? chopsLightLogo : chopsDarkLogo}
          alt="CHOps"
        />
        {/* The card has a slowly turning light on its border (Magic UI Shine Border). */}
        <div className="login-card-shine">
          <div className="login-card">
      {formStatus === "login" && (
        <motion.div
          initial={{ opacity: 0.2, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeIn" }}
          className="form-conatiner"
        >
          <div className="top-title-login">
            <div
              style={{
                textAlign: "left",
                marginBottom: "30px",
                lineHeight: "30px",
              }}
              className="login-title"
            >
              <h4
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  margin: "0px",
                }}
              >
                Login
              </h4>
              <p>Enter your username and password to continue</p>
            </div>
          </div>

          <div style={{ textAlign: "center", marginBottom: "0px" }}></div>
          {error && (
            <Notice tone="danger" icon="ti-alert-circle" style={{ marginBottom: "16px", width: "100%" }}> {error}
            </Notice>
          )}

          {/* method, name and id help the browser to find the login form
                and offer to save the password. */}
            <form onSubmit={handleSubmit} method="post" className="login-form-con">
            <FormField label="Username" style={{ marginBottom: "14px" }}>
              <Input
                id="login-username"
                name="username"
                style={{ height: "40px" }}
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
              />
            </FormField>
            <div
              className="form-group "
              style={{ marginBottom: "20px", width: "100%" }}
            >
              <div className="login-password-row">
                <label className="form-label" htmlFor="login-password">Password</label>
                <button
                  type="button"
                  className="login-text-link"
                  onClick={() => {
                    setError("");
                    setFormStatus("forget-mail");
                  }}
                >
                  Forgot password?
                </button>
              </div>
              <PasswordInput id="login-password" name="password" autoComplete="current-password" className="tw:h-10" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>

            <div className="form-login-btn">
              <button type="submit" className="login-submit" disabled={loading}>
                {loading ? (
                  <>
                    <span className="loading-spinner"></span> Signing in...
                  </>
                ) : (
                  <span
                    className=""
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexDirection: "row",
                      gap: "10px",
                    }}
                  >
                    <Icon className="ti ti-login" /> Login
                  </span>
                )}
              </button>
            </div>

            {/* <>
        <button
          className="btn btn-secondary"
          
          style={{ width: '100%', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
        >
          <Icon className="ti ti-shield-lock"></Icon> Sign in with SSO
        </button>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px' }}>or sign in with username and password</div>
      </> */}
          </form>
        </motion.div>
      )}
      {formStatus === "forget-mail" && (
        <motion.div
          initial={{ opacity: 0.2, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeIn" }}
          className="form-conatiner"
        >
          <div className="top-title-login">
            <div
              style={{
                textAlign: "left",
                marginBottom: "30px",
                lineHeight: "30px",
                width: "300px",
              }}
              className="login-title"
            >
              <h4
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  margin: "0px",
                }}
              >
                Forgot password
              </h4>
              <p>Enter your email to reset your password.</p>
            </div>
          </div>

          <div style={{ textAlign: "center", marginBottom: "0px" }}></div>
          {error && (
            <Notice tone="danger" icon="ti-alert-circle" style={{ marginBottom: "16px", width: "100%" }}> {error}
            </Notice>
          )}

          <form
            onSubmit={handleEmailVerifiySubmit}
            className="login-form-con"
          >
            <FormField label="Email-ID" style={{ marginBottom: "14px" }}>
              <Input
                style={{ height: "40px" }}
                value={verfiyEmail}
                onChange={(e) => setVerifyEmail(e.target.value)}
                required
                autoFocus
              />
            </FormField>

            <div className="form-login-btn">
              <Button
                variant="primary"
                type="submit"
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "45px",
                  fontSize: "0.9375rem",
                }}
              >
                {loading ? (
                  <>
                    <span className="loading-spinner"></span> Sending...
                  </>
                ) : (
                  <span
                    className=""
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexDirection: "row",
                      gap: "10px",
                    }}
                  >
                    Send Verification Code
                  </span>
                )}
              </Button>
            </div>
            <div style={{ textAlign: "center", margin: "10px 0px" }}>
              <p style={{ fontSize: "0.8125rem" }}>
                Have an account?{" "}
                <button
                  type="button"
                  className="login-text-link"
                  onClick={() => setFormStatus("login")}
                >
                  Back to Login
                </button>
              </p>
            </div>
          </form>
        </motion.div>
      )}
      {formStatus === "forget-otp" && (
        <OTP_Component setFormStatus={setFormStatus} />
      )}

      {formStatus === "forget-change" && (
        <ChangePasswordComponent setFormStatus={setFormStatus} />
      )}
          </div>
        </div>
      </section>
      </div>

      {lightboxSrc && (
        <div
          className="login-lightbox-overlay"
          onClick={() => setLightboxSrc(null)}
        >
          <button
            className="login-lightbox-close"
            onClick={() => setLightboxSrc(null)}
            aria-label="Close preview"
          >
            <Icon className="ti ti-x"></Icon>
          </button>
          <img
            src={lightboxSrc}
            className="login-lightbox-img"
            alt="CHOps preview"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
