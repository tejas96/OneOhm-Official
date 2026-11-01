// biome-ignore-all lint/performance/noImgElement: static brand assets, already sized.
import { cn } from '@oneohm/design-system/web';

interface BrandLogoProps {
  readonly alt: string;
  /** `auto`: colour on paper, white in dark mode. `white`: always white (on the ocean panel). */
  readonly tone?: 'auto' | 'white';
  readonly className?: string;
}

/** The full-colour logo on paper; the white logo in dark mode or on the ocean panel. */
export function BrandLogo({ alt, tone = 'auto', className }: BrandLogoProps) {
  if (tone === 'white') {
    return (
      <span className={cn('relative inline-flex', className)}>
        <img
          src="/brand/oneohm-logo-white.webp"
          alt={alt}
          width={1200}
          height={390}
          className="h-full w-auto"
        />
      </span>
    );
  }
  return (
    <span className={cn('relative inline-flex', className)}>
      <img
        src="/brand/oneohm-logo.webp"
        alt={alt}
        width={1200}
        height={390}
        className="h-full w-auto dark:hidden"
      />
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
