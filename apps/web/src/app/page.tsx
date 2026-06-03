import { getDownloads } from "@/lib/releases";
import { StructuredData } from "@/components/structured-data";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Hero } from "@/components/sections/hero";
import { Features } from "@/components/sections/features";
import { Providers } from "@/components/sections/providers";
import { Philosophy } from "@/components/sections/philosophy";
import { CurvedBand } from "@/components/sections/curved-band";
import { DownloadSection } from "@/components/sections/download";
import { OpenSource } from "@/components/sections/open-source";

export default async function HomePage() {
  const downloads = await getDownloads();

  return (
    <>
      <StructuredData />
      <SiteHeader />
      <main>
        <Hero downloads={downloads} />
        <Features />
        <Providers />
        <Philosophy />
        <CurvedBand />
        <DownloadSection downloads={downloads} />
        <OpenSource />
      </main>
      <SiteFooter />
    </>
  );
}
