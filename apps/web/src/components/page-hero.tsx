import Link from 'next/link';
import type { ReactNode } from 'react';
import { HeaderBandBar } from './app-shell';

/**
 * The coloured header band of the main pages (dashboard, projects, reports):
 * indigo-600 → violet-600, white title, indigo-100 subtitle (>= 4.5:1 across
 * the gradient). Edge to edge with a rounded foot on phones, where it also
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
    <header className="-mx-4 -mt-6 rounded-b-[28px] bg-gradient-to-br from-indigo-600 to-violet-600 px-5 pb-[52px] pt-[max(1rem,env(safe-area-inset-top))] text-white sm:-mx-6 md:mx-0 md:mt-0 md:rounded-3xl md:px-8 md:pt-8">
      <HeaderBandBar />
      {back && (
        <Link
          href={back.href}
          className="-ml-1 mb-1 inline-flex min-h-11 items-center rounded-lg px-1 text-sm font-medium text-indigo-100 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
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
            <p className="mt-1 text-sm text-indigo-100">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}
