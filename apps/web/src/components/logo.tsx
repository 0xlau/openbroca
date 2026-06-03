import Image from "next/image";
import { site } from "@/lib/site";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Image
        src="/mark.svg"
        alt=""
        width={20}
        height={24}
        priority
        className="h-6 w-auto"
        aria-hidden
      />
      <span className="text-lg font-semibold tracking-tight text-white">
        {site.name}
      </span>
    </span>
  );
}
