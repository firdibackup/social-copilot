'use client';

import {useLocale, useTranslations} from 'next-intl';
import {useRouter} from 'next/navigation';
import {useTransition} from 'react';
import {setLocale} from '@/i18n/actions';
import {LOCALES, type Locale} from '@/i18n/locale-config';

interface LocaleToggleProps {
  variant: 'landing' | 'app';
  className?: string;
}

const LABEL_KEYS: Record<Locale, 'indonesian' | 'english'> = {
  id: 'indonesian',
  en: 'english'
};

/**
 * A two-option segmented control: a tinted track with a raised white thumb that slides under the active language.
 * Track and thumb share the control radius (10px outside, 7px inside the 3px padding) so the corners stay concentric.
 * The app variant draws a compact 32px pill but keeps each option's hit area at 44px, so it sits neatly in the h-14 header.
 */
export function LocaleToggle({variant, className}: LocaleToggleProps) {
  const locale = useLocale();
  const t = useTranslations('common');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const activeIndex = Math.max(0, LOCALES.indexOf(locale as Locale));

  function selectLocale(nextLocale: Locale) {
    if (nextLocale === locale || isPending) return;

    startTransition(async () => {
      await setLocale(nextLocale);
      router.refresh();
    });
  }

  const trackPosition = variant === 'app' ? 'inset-x-0 top-1/2 h-8 -translate-y-1/2' : 'inset-0';
  const buttonSize = variant === 'app' ? 'min-h-11 min-w-11 px-1' : 'h-8 min-w-10 px-2.5';

  return (
    <div
      role="group"
      aria-label={t('localeToggleLabel')}
      aria-busy={isPending}
      className={`relative inline-grid shrink-0 grid-cols-2 items-center text-xs font-semibold tracking-wide ${className ?? ''}`}
    >
      <span aria-hidden="true" className={`pointer-events-none absolute rounded-lg bg-zinc-100 ${trackPosition}`}>
        <span
          className={`absolute top-[3px] bottom-[3px] left-[3px] w-[calc(50%-3px)] rounded-[7px] bg-paper shadow-[0_1px_2px_rgba(23,24,39,0.08),0_2px_6px_rgba(101,88,245,0.10)] transition-transform duration-200 ease-out motion-reduce:transition-none ${activeIndex === 1 ? 'translate-x-full' : 'translate-x-0'}`}
        />
      </span>
      {LOCALES.map((option) => {
        const active = locale === option;
        return (
          <button
            key={option}
            type="button"
            aria-label={t(LABEL_KEYS[option])}
            aria-pressed={active}
            disabled={isPending}
            onClick={() => selectLocale(option)}
            className={`relative z-10 inline-flex cursor-pointer items-center justify-center rounded-lg ${buttonSize} transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-focus disabled:cursor-wait disabled:opacity-60 ${
              variant === 'app' ? 'focus-visible:-outline-offset-[7px]' : 'focus-visible:-outline-offset-2'
            } ${active ? 'text-ink' : 'text-ink-muted hover:text-ink'}`}
          >
            {option.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
