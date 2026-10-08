import Image from "next/image";
import { cn } from "@/lib/utils";
import wrugbyLogo from "@/Assets/wrugby.png";

export function Logo({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <Image
      src={wrugbyLogo}
      alt="World Rugby"
      priority
      className={cn(
        "h-auto object-contain",
        compact ? "w-11" : "h-[52px] w-auto max-w-[210px]",
        className
      )}
    />
  );
}
