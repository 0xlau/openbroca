"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import type { Downloads } from "@/lib/releases";

type OS = "mac" | "windows" | "linux" | "other";

function detectOS(): OS {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent.toLowerCase();
  const platform = (navigator.platform || "").toLowerCase();
  if (/mac|iphone|ipad|ipod/.test(ua) || platform.startsWith("mac"))
    return "mac";
  if (/win/.test(ua) || platform.startsWith("win")) return "windows";
  if (/linux|x11/.test(ua) || platform.includes("linux")) return "linux";
  return "other";
}

const LABELS: Record<OS, string> = {
  mac: "Download for macOS",
  windows: "Download for Windows",
  linux: "Download for Linux",
  other: "Download",
};

export function DownloadButton({
  downloads,
  size = "lg",
  className = "",
}: {
  downloads: Downloads;
  size?: "lg" | "sm";
  className?: string;
}) {
  // Render a stable label on the server, then refine once we know the client OS
  // to avoid hydration mismatches.
  const [os, setOs] = useState<OS>("other");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setOs(detectOS());
    setReady(true);
  }, []);

  const hrefByOS: Record<OS, string> = {
    mac: downloads.macArm,
    windows: downloads.windows,
    linux: downloads.linuxAppImage,
    other: downloads.releasesUrl,
  };

  const href = hrefByOS[os];
  const label = ready ? LABELS[os] : "Download";

  const sizing =
    size === "lg"
      ? "h-12 px-6 text-base"
      : "h-9 px-4 text-sm";

  return (
    <a
      href={href}
      className={`group inline-flex items-center justify-center gap-2 rounded-full bg-brand font-semibold text-brand-foreground shadow-[0_8px_30px_-8px_rgba(255,68,5,0.7)] transition hover:bg-brand-soft hover:shadow-[0_10px_40px_-8px_rgba(255,68,5,0.85)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${sizing} ${className}`}
    >
      <Download
        className={size === "lg" ? "size-5" : "size-4"}
        strokeWidth={2.25}
      />
      {label}
    </a>
  );
}
