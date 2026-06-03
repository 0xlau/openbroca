import Link from "next/link";
import { Github } from "lucide-react";
import { navLinks, site } from "@/lib/site";
import { Logo } from "./logo";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg/70 backdrop-blur-xl">
      <div className="container-px flex h-16 items-center justify-between">
        <Link href="/" aria-label={`${site.name} home`}>
          <Logo />
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target={link.href.startsWith("http") ? "_blank" : undefined}
              rel={link.href.startsWith("http") ? "noreferrer" : undefined}
              className="text-sm text-white/70 transition hover:text-white"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <a
            href={site.repo}
            target="_blank"
            rel="noreferrer"
            aria-label="OpenBroca on GitHub"
            className="inline-flex size-9 items-center justify-center rounded-full border border-line text-white/80 transition hover:border-line-strong hover:text-white"
          >
            <Github className="size-4.5" />
          </a>
          <a
            href="#download"
            className="inline-flex h-9 items-center rounded-full bg-white px-4 text-sm font-semibold text-black transition hover:bg-white/90"
          >
            Download
          </a>
        </div>
      </div>
    </header>
  );
}
