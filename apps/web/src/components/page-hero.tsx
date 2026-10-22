import Link from 'next/link';
import type { ReactNode } from 'react';
import { HeaderBandBar } from './app-shell';

/**
 * The header band of the main pages (dashboard, projects, reports): flat NT
 * charcoal with a 3px yellow foot line, white title, light grey subtitle. Edge to edge with a rounded foot on phones, where it also
 * carries the logo, bell and user menu (the top bar is hidden there, see
 * `hasHeaderBand` in app-shell); a rounded panel from md. Put the page's
 * first row of cards right after it with `-mt-8` so they overlap its foot.
 */
export function PageHero({
  title,
  subtitle,
  actions,
  back,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** A parent page link above the title. */
  back?: { href: string; label: string };
}) {
  return (
    <header className="-mx-4 -mt-6 rounded-b-[28px] border-b-[3px] border-nt-yellow bg-nt-charcoal px-5 pb-[52px] pt-[max(1rem,env(safe-area-inset-top))] text-white sm:-mx-6 md:mx-0 md:mt-0 md:rounded-3xl md:px-8 md:pt-8">
      <HeaderBandBar />
      {back && (
        <Link
          href={back.href}
          className="-ml-1 mb-1 inline-flex min-h-11 items-center rounded-lg px-1 text-sm font-medium text-nt-yellow hover:underline focus-visible:outline-2 focus-visible:outline-nt-yellow"
        >
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-sm text-on-dark-muted">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}
