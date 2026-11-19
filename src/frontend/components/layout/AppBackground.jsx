// AppBackground - Floating 3D particles (Magic UI) behind the page content.
//
// Subtle by design: 150 small particles in the accent color, at most 30
// frames per second. The cards are solid, so the particles show only in the
// gaps between them. The user can turn it off in the user menu, and it
// draws one still frame when the system asks for reduced motion.
//
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { useMemo } from "react";
import { Floating3DParticles } from "../ui/floating-3d-particles.jsx";
import { useTheme } from "../../App.jsx";
import { useBackgroundMotion } from "../../utils/backgroundMotion.js";

const PARTICLE_COUNT = 150;
const MAX_FRAMES_PER_SECOND = 30;

// The particle color is the accent token of the current theme.
function readAccentColor() {
  const value = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
  return value || "#9590FF";
}

export default function AppBackground() {
  const { theme } = useTheme();
  const isOn = useBackgroundMotion();
  // Read again when the theme changes, so the particles change color with it.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- theme is the trigger, the value comes from CSS.
  const color = useMemo(() => readAccentColor(), [theme]);

  if (!isOn) return null;
  return (
    <Floating3DParticles
      className="app-background"
      quantity={PARTICLE_COUNT}
      maxFps={MAX_FRAMES_PER_SECOND}
      color={color}
      size={2.2}
      opacity={theme === "light" ? 0.22 : 0.27}
      drift={0.35}
      depth={0.5}
    />
  );
}
