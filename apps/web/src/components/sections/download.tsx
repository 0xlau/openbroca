import { site } from "@/lib/site";
import type { Downloads } from "@/lib/releases";
import {
  AppleIcon,
  WindowsIcon,
  LinuxIcon,
} from "../platform-icons";
import { Reveal } from "../reveal";
import type { SVGProps, ComponentType } from "react";

type PlatformCard = {
  name: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  note: string;
  links: { label: string; href: string }[];
};

function buildPlatforms(d: Downloads): PlatformCard[] {
  return [
    {
      name: "macOS",
      icon: AppleIcon,
      note: "macOS 11+ · signed & notarized",
      links: [
        { label: "Apple Silicon (.dmg)", href: d.macArm },
        { label: "Intel (.dmg)", href: d.macIntel },
      ],
    },
    {
      name: "Windows",
      icon: WindowsIcon,
      note: "Windows 10 & 11 · 64-bit",
      links: [{ label: "Installer (.exe)", href: d.windows }],
    },
    {
      name: "Linux",
      icon: LinuxIcon,
      note: "x86_64 · most distributions",
      links: [
        { label: "AppImage", href: d.linuxAppImage },
        { label: "Debian (.deb)", href: d.linuxDeb },
      ],
    },
  ];
}

export function DownloadSection({ downloads }: { downloads: Downloads }) {
  const platforms = buildPlatforms(downloads);

  return (
    <section
      id="download"
      className="scroll-mt-20 border-t border-line py-24 md:py-32"
    >
      <div className="container-px">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand">
            Download
          </p>
          <h2 className="mt-3 font-display text-4xl tracking-tight text-white md:text-5xl">
            Get OpenBroca for your platform.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-white/60">
            Free and open source. Latest stable release{" "}
            <span className="font-medium text-white/80">
              v{downloads.version}
            </span>
            .
          </p>
        </Reveal>

        <Reveal
          delay={120}
          className="mx-auto mt-14 grid max-w-5xl gap-5 md:grid-cols-3"
        >
          {platforms.map(({ name, icon: Icon, note, links }) => (
            <div
              key={name}
              className="flex flex-col rounded-2xl border border-line bg-bg-elevated/40 p-7 transition hover:border-line-strong"
            >
              <Icon className="size-8 text-white" />
              <h3 className="mt-5 text-xl font-semibold text-white">{name}</h3>
              <p className="mt-1 text-sm text-white/50">{note}</p>

              <div className="mt-6 flex flex-1 flex-col justify-end gap-2.5">
                {links.map((link, i) => (
                  <a
                    key={link.label}
                    href={link.href}
                    className={
                      i === 0
                        ? "inline-flex h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-black transition hover:bg-white/90"
                        : "inline-flex h-11 items-center justify-center rounded-xl border border-line-strong px-4 text-sm font-medium text-white/85 transition hover:border-white/25 hover:text-white"
                    }
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </Reveal>

        <Reveal delay={200}>
          <p className="mt-8 text-center text-sm text-white/45">
            Looking for older versions or checksums? See{" "}
            <a
              href={site.releases}
              target="_blank"
              rel="noreferrer"
              className="text-white/70 underline-offset-4 hover:text-white hover:underline"
            >
              all releases on GitHub
            </a>
            .
          </p>
        </Reveal>
      </div>
    </section>
  );
}
