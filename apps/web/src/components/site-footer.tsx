import { site } from "@/lib/site";
import { Logo } from "./logo";
import { Reveal } from "./reveal";

const columns: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "Providers", href: "#providers" },
      { label: "Download", href: "#download" },
    ],
  },
  {
    title: "Open source",
    links: [
      { label: "GitHub", href: site.repo },
      { label: "Releases", href: site.releases },
      { label: "Issues", href: site.issues },
      { label: "License (MIT)", href: site.license },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="relative isolate overflow-hidden border-t border-line">
      <Reveal className="relative z-10">
        <div className="container-px grid gap-10 py-14 md:grid-cols-[1.5fr_1fr_1fr]">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-4 text-sm leading-relaxed text-white/55">
              {site.shortDescription} An open-source voice interface for the AI
              era.
            </p>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-semibold text-white">{col.title}</h3>
              <ul className="mt-4 space-y-3">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      target={
                        link.href.startsWith("http") ? "_blank" : undefined
                      }
                      rel={
                        link.href.startsWith("http") ? "noreferrer" : undefined
                      }
                      className="text-sm text-white/55 transition hover:text-white"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Reveal>

      <div className="relative z-10 border-t border-line">
        <div className="container-px flex flex-col items-center justify-between gap-3 py-6 text-xs text-white/45 sm:flex-row">
          <p>
            © {site.name}. Released under the{" "}
            <a
              href={site.license}
              target="_blank"
              rel="noreferrer"
              className="underline-offset-4 hover:text-white hover:underline"
            >
              MIT License
            </a>
            .
          </p>
          <p>
            Built by{" "}
            <a
              href={site.author.url}
              target="_blank"
              rel="noreferrer"
              className="underline-offset-4 hover:text-white hover:underline"
            >
              {site.author.name}
            </a>
          </p>
        </div>
      </div>

      {/* Oversized faint brand watermark bleeding off the bottom edge */}
      <div
        aria-hidden
        className="pointer-events-none relative select-none px-2 pt-4"
      >
        <span className="block translate-y-[0.12em] bg-gradient-to-b from-white/[0.07] to-white/[0.012] bg-clip-text text-center font-sans text-[19vw] font-bold leading-[0.75] tracking-[-0.045em] text-transparent">
          OpenBroca
        </span>
      </div>
    </footer>
  );
}
