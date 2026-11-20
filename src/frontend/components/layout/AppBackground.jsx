// AppBackground - Floating 3D particles (Magic UI) behind the page content.
//
// 150 particles in the accent color (80 on a small
// device), at most 15 frames per second. The cards are solid, so the
// particles show only in the gaps between them. The user can turn it off in
// the user menu, and it draws one still frame when the system asks for
// reduced motion. It pauses when the window is not in focus.
//
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { useMemo } from "react";
import { Floating3DParticles } from "../ui/floating-3d-particles.jsx";
import { useTheme } from "../../App.jsx";
import { useBackgroundMotion } from "../../utils/backgroundMotion.js";

const PARTICLE_COUNT = 150;
const SMALL_DEVICE_PARTICLE_COUNT = 80;
const MAX_FRAMES_PER_SECOND = 15;
// Size and strength of the dots (package 6.1: bigger and stronger than before,
// which was 2.2 and 0.27 / 0.22).
const PARTICLE_SIZE = 4;
const DARK_THEME_OPACITY = 0.55;
const LIGHT_THEME_OPACITY = 0.5;

// A device with at most 4 CPU cores or 4 GB of memory gets fewer particles.
// deviceMemory is not in every browser; no value counts as a big device.
export function isSmallDevice(browserNavigator = navigator) {
  const cores = browserNavigator.hardwareConcurrency || 8;
  const memoryInGb = browserNavigator.deviceMemory || 8;
  return cores <= 4 || memoryInGb <= 4;
}

// The particle color is the accent token of the current theme.
function readAccentColor() {
  const value = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
  return value || "#9590FF";
}

// className places the layer: "app-background" behind the app, or another
// class for another page (the Login page uses "login-background").
// particleCount: the number of particles on a big device (Login uses more).
export default function AppBackground({ className = "app-background", particleCount = PARTICLE_COUNT }) {
  const { theme } = useTheme();
  const isOn = useBackgroundMotion();
  // Read again when the theme changes, so the particles change color with it.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- theme is the trigger, the value comes from CSS.
  const color = useMemo(() => readAccentColor(), [theme]);

  if (!isOn) return null;
  return (
    <Floating3DParticles
      className={className}
      quantity={isSmallDevice() ? SMALL_DEVICE_PARTICLE_COUNT : particleCount}
      maxFps={MAX_FRAMES_PER_SECOND}
      color={color}
      size={PARTICLE_SIZE}
      opacity={theme === "light" ? LIGHT_THEME_OPACITY : DARK_THEME_OPACITY}
      drift={0.35}
      depth={0.5}
    />
  );
}
