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

export function LocaleToggle({variant, className}: LocaleToggleProps) {
  const locale = useLocale();
  const t = useTranslations('common');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function selectLocale(nextLocale: Locale) {
    if (nextLocale === locale || isPending) return;

    startTransition(async () => {
      await setLocale(nextLocale);
      router.refresh();
    });
  }

  const variantClass =
    variant === 'landing'
      ? 'border-hairline bg-paper text-ink-muted shadow-sm'
      : 'border-[#e3e0f5] bg-white/80 text-ink-muted';
  const buttonSize = variant === 'app' ? 'min-h-11 min-w-11 cursor-pointer px-2' : 'px-1.5 py-1';

  return (
    <div
      role="group"
      aria-label={t('localeToggleLabel')}
      aria-busy={isPending}
      className={`inline-flex shrink-0 items-center rounded-lg border p-0.5 text-[11px] font-semibold ${variantClass} ${className ?? ''}`}
    >
      {LOCALES.map((option, index) => {
        const active = locale === option;
        return (
          <span key={option} className="contents">
            {index > 0 && <span aria-hidden="true" className="px-0.5 opacity-40">|</span>}
            <button
              type="button"
              aria-label={t(LABEL_KEYS[option])}
              aria-pressed={active}
              disabled={isPending}
              onClick={() => selectLocale(option)}
              className={`rounded-md ${buttonSize} transition-colors duration-150 disabled:cursor-wait disabled:opacity-60 ${active ? (variant === 'app' ? 'bg-accent-soft text-accent-deep' : 'bg-paper text-ink ring-1 ring-hairline') : 'hover:text-ink'}`}
            >
              {option.toUpperCase()}
            </button>
          </span>
        );
      })}
    </div>
  );
}
