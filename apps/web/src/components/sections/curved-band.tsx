import { CurvedLoop } from "../curved-loop";

export function CurvedBand() {
  return (
    <section
      aria-hidden
      className="relative overflow-hidden pt-6 md:pt-6 pb-24"
    >
      <CurvedLoop
        text="SPEAK ✦ POLISH ✦ TRANSFORM ✦ TRANSLATE ✦ COMMAND ✦ SHIP ✦ "
        textClassName="font-display"
        className="w-full text-white"
        fontSize={82}
        speed={1.3}
      />
    </section>
  );
}
