export const site = {
  name: "OpenBroca",
  tagline: "An open-source voice interface for the AI era.",
  description:
    "OpenBroca turns speech into text, intent into action, and your voice into a system-wide input layer. Dictate into any app, with the cloud or local models you choose.",
  shortDescription: "Just speak your thoughts.",
  version: "0.2.1",
  url: "https://openbroca.com",
  repo: "https://github.com/0xlau/openbroca",
  releases: "https://github.com/0xlau/openbroca/releases/latest",
  issues: "https://github.com/0xlau/openbroca/issues",
  license: "https://github.com/0xlau/openbroca/blob/main/LICENSE",
  author: {
    name: "Timothy Lau",
    url: "https://github.com/0xlau",
  },
} as const;

export type NavLink = { label: string; href: string };

export const navLinks: NavLink[] = [
  { label: "Features", href: "#features" },
  { label: "Providers", href: "#providers" },
  { label: "Download", href: "#download" },
  { label: "GitHub", href: site.repo },
];
