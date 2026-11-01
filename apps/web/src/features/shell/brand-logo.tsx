import { cn } from '@oneohm/design-system/web';

/** The full-colour logo on paper, the white logo in dark mode. */
export function BrandLogo({
  alt,
  className,
}: {
  readonly alt: string;
  readonly className?: string;
}) {
  return (
    <span className={cn('relative inline-flex', className)}>
      {/* biome-ignore lint/performance/noImgElement: static brand assets, already sized. */}
      <img
        src="/brand/oneohm-logo.webp"
        alt={alt}
        width={1200}
        height={390}
        className="h-full w-auto dark:hidden"
      />
      {/* biome-ignore lint/performance/noImgElement: static brand assets, already sized. */}
      <img
        src="/brand/oneohm-logo-white.webp"
        alt={alt}
        width={1200}
        height={390}
        className="hidden h-full w-auto dark:block"
      />
    </span>
  );
}
