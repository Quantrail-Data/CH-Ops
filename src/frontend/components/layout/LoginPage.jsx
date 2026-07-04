// LoginPage - Login Authentication
//
// The entry point for CHOps. Features a split layout: login form on the left
// with animated brand carousel on the right. Supports username/password
// authentication with loading states and error handling.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited



import { useState, useEffect } from "react";
import Icon from "../common/Icon.jsx";
import { useAuth, useTheme } from "../../App.jsx";
import { motion } from "motion/react";
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";
import "swiper/css/pagination";
import "swiper/css/navigation";

// import "./styles.css";
import { Pagination, Navigation, Autoplay, EffectFade } from "swiper/modules";
import img_1 from "../../assets/001.png";
import img_2 from "../../assets/002.png";
import img_3 from "../../assets/003.png";
import img_4 from "../../assets/004.png";
import img_5 from "../../assets/005.png";
import img_6 from "../../assets/006.png";
import img_7 from "../../assets/007.png";
import img_8 from "../../assets/008.png";
import img_9 from "../../assets/009.png";
import img_10 from "../../assets/010.png";

import img_11 from "../../assets/021.png";
import img_12 from "../../assets/022.png";
import img_13 from "../../assets/023.png";
import img_14 from "../../assets/024.png";
import img_15 from "../../assets/025.png";
import img_16 from "../../assets/026.png";
import img_17 from "../../assets/027.png";
import img_18 from "../../assets/028.png";
import img_19 from "../../assets/029.png";
import img_20 from "../../assets/030.png";




import chopsLightLogo from "../../assets/chops-light.svg";
import chopsDarkLogo from "../../assets/chops-dark.svg";

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

// animation: marquee-scroll 15s linear infinite;
export default function LoginPage() {
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState(null);

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
    img_1,
    img_2,
    img_3,
    img_4,
    img_5,
    img_6,
    img_7,
    img_8,
    img_9,
    img_10,
    img_11,
  ];
  const darkThemeImages = [
    img_11,
    img_12,
    img_13,
    img_14,
    img_15,
    img_16,
    img_17,
    img_18,
    img_19,
    img_20,
  ];
  const leftImages = theme !== "dark" ? darkThemeImages : lightThemeImages;
  var settings = {
    dots: true,
    infinite: true,
    speed: 500,
    slidesToShow: 1,
    slidesToScroll: 1,
  };
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
      login(data);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "var(--bg-page)",
      }}
    >
      {!lightboxSrc && <button
        className="btn btn-ghost btn-sm"
        onClick={toggleTheme}
        style={{
          position: "absolute",
          top: "16px",
          right: "16px",
          zIndex: "9999",
        }}
        title={theme === "dark" ? "Light mode" : "Dark mode"}
      >
        <Icon
          className={`ti ${theme === "dark" ? "ti-sun" : "ti-moon"}`}
          style={{ fontSize: "20px" }}
        ></Icon>
      </button>}

      <div className="main-login-container">
        <div
          className="left-container-login"
          style={{
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "start",
          }}
        >
          <motion.div className="logo-img-container" initial={{ opacity: 0.2, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: "easeIn" }}
            style={{ marginTop: "10rem" }}>
             
            <img
              style={{ width: "100%", maxWidth: "400px", height: "auto", pointerEvents: "none" }}
              src={theme === "dark" ? chopsLightLogo : chopsDarkLogo}
            />
          </motion.div>
          <motion.div
            initial={{ opacity: 0.2, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: "easeIn" }}
            className="form-conatiner"
          >
            <div className="top-title-login">
            
              <div
                style={{ textAlign: "center", marginBottom: "50px",lineHeight:"30px" }}
                className="login-title"
              >
                <h4
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0px",
                  }}
                >
                  {"Login".toUpperCase()}
                </h4>
                <p>Enter your username and password to continue</p>
              </div>
            </div>

            <div style={{ textAlign: "center", marginBottom: "0px" }}></div>
            {error && (
              <div
                className="alert-banner danger"
                style={{ marginBottom: "16px", width: "20rem" }}
              >
                <Icon className="ti ti-alert-circle"></Icon> {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="login-form-con">
              <div className="form-group" style={{ marginBottom: "14px" }}>
                <label className="form-label">Username</label>
                <input
                  className="form-input"
                  style={{ height: "40px" }}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div
                className="form-group "
                style={{ marginBottom: "20px", width: "100%" }}
              >
                <label className="form-label">Password</label>
                <div
                  className=""
                  style={{ width: "100%", position: "relative" }}
                >
                  <input
                    className="form-input"
                    style={{
                      width: "100%",
                      paddingRight: "35px",
                      height: "40px",
                    }}
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <div
                    className="password-eye"
                    style={{
                      position: "absolute",
                      right: "15px",
                      top: "22%",
                      cursor: "pointer",
                    }}
                    title={showPassword ? "hide" : "show"}
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <Icon className="ti ti-eye-off" /> : <Icon className="ti ti-eye" />}
                  </div>
                </div>
              </div>
              {/* <div className="form-login-rem">
                <div>
                  <input type="checkbox" />
                  <span>Remember me</span>
                </div>
                <div>
                  <a href="">
                    {" "}
                    <p>Forgot password</p>
                  </a>
                </div>
              </div> */}

              <div className="form-login-btn">
                <button
                  className="btn btn-primary"
                  type="submit"
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "45px",
                    fontSize: "15px",
                  }}
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
        </div>
        <div className="right-container-login">
          <div className="top-con">
            <div className="marquee-container">
              <div className="marquee-text">
                {leftImages.map((img, idx) => {
                  return (
                    <img
                      src={img}
                      className="mar-left-img"
                      key={idx}
                      onClick={() => setLightboxSrc(img)}
                    />
                  );
                })}
              </div>
            </div>
            <div className="marquee-container2">
              <div className="marquee-text2">
                {leftImages.map((img, idx) => {
                  return (
                    <img
                      src={img}
                      className="mar-left-img"
                      key={idx}
                      onClick={() => setLightboxSrc(img)}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          <div className="bottom-con">
            <Swiper
              pagination={true}
              modules={[Pagination, Navigation, Autoplay, EffectFade]}
              autoplay={{
                delay: 5000,
                disableOnInteraction: false,
              }}
              loop={true}
              className="mySwiper"
            >
              {swiperDatas?.map((data, indx) => {
                return (
                  <SwiperSlide key={indx}>
                    <div className="hero-content">
                      <h1>{data?.title}</h1>
                      <p className="">{data?.subtitle}</p>
                    </div>
                  </SwiperSlide>
                );
              })}
            </Swiper>
          </div>
        </div>
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
