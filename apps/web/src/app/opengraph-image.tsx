import { ImageResponse } from "next/og";
import { site } from "@/lib/site";

// Used for both the OpenGraph image and (as a fallback) the Twitter card.
export const alt = `${site.name} — ${site.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Brand sunburst mark (from public/mark.svg), scaled up for the social card.
const markPaths = [
  "M25.0887 5.05386L21.1557 4L17.8412 16.3696L14.8489 5.20224L10.9158 6.2561L14.1488 18.3216L6.09618 10.269L3.21699 13.1482L12.0497 21.981L1.04995 19.0336L-0.00390625 22.9666L12.0147 26.187C11.8771 25.5935 11.8043 24.9751 11.8043 24.3397C11.8043 19.8421 15.4503 16.1961 19.948 16.1961C24.4456 16.1961 28.0916 19.8421 28.0916 24.3397C28.0916 24.971 28.0197 25.5856 27.8838 26.1756L38.8065 29.1023L39.8603 25.1693L27.7939 21.9361L38.7944 18.9885L37.7405 15.0555L25.6746 18.2885L33.7272 10.2359L30.848 7.35674L22.1378 16.067L25.0887 5.05386Z",
  "M27.8723 26.2214C27.5351 27.647 26.8232 28.9277 25.8464 29.9538L33.7594 37.8669L36.6386 34.9877L27.8723 26.2214Z",
  "M25.7665 30.0366C24.7779 31.0463 23.5286 31.7998 22.1276 32.1881L25.007 42.9341L28.94 41.8802L25.7665 30.0366Z",
  "M21.9807 32.2274C21.3307 32.3945 20.6494 32.4833 19.9473 32.4833C19.1951 32.4833 18.4667 32.3813 17.7752 32.1904L14.8932 42.9462L18.8262 44L21.9807 32.2274Z",
  "M17.6361 32.1507C16.2565 31.7431 15.0294 30.98 14.061 29.9674L6.1285 37.8999L9.00769 40.7791L17.6361 32.1507Z",
  "M13.9956 29.8973C13.0438 28.8783 12.3505 27.6147 12.0205 26.2111L1.06214 29.1474L2.11599 33.0804L13.9956 29.8973Z",
];

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#08080a",
          backgroundImage:
            "radial-gradient(900px 600px at 18% -10%, rgba(255,68,5,0.30), transparent 60%), radial-gradient(700px 500px at 100% 110%, rgba(255,45,122,0.18), transparent 55%)",
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Top: brand mark + wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <svg
            width="72"
            height="86"
            viewBox="0 0 40 48"
            style={{ filter: "drop-shadow(0 12px 34px rgba(255,68,5,0.5))" }}
          >
            {markPaths.map((d, i) => (
              <path key={i} d={d} fill="#FF4405" />
            ))}
          </svg>
          <div
            style={{
              fontSize: 40,
              fontWeight: 700,
              color: "#ffffff",
              letterSpacing: "-0.02em",
            }}
          >
            OpenBroca
          </div>
        </div>

        {/* Middle: headline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: 76,
              fontWeight: 800,
              lineHeight: 1.05,
              color: "#ffffff",
              letterSpacing: "-0.03em",
              maxWidth: 980,
            }}
          >
            Open-source voice dictation for any app
          </div>
          <div
            style={{
              fontSize: 32,
              lineHeight: 1.4,
              color: "rgba(255,255,255,0.66)",
              maxWidth: 920,
            }}
          >
            Turn speech into text in any app — with the cloud or fully local AI
            models you choose.
          </div>
        </div>

        {/* Bottom: meta strip */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 26,
            color: "rgba(255,255,255,0.55)",
          }}
        >
          <span style={{ color: "#FF4405", fontWeight: 700 }}>Free</span>
          <span>·</span>
          <span>Open source · MIT</span>
          <span>·</span>
          <span>macOS · Windows · Linux</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
