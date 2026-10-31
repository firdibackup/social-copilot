import {describe, expect, it} from 'vitest';
import {DEFAULT_LOCALE, intlLocale, isLocale, resolveLocale} from './locale';

describe('locale helpers', () => {
  it('accepts only supported locales', () => {
    expect(isLocale('id')).toBe(true);
    expect(isLocale('en')).toBe(true);
    expect(isLocale('en-US')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });

  it('falls back to Indonesian', () => {
    expect(resolveLocale('en')).toBe('en');
    expect(resolveLocale('unknown')).toBe(DEFAULT_LOCALE);
    expect(resolveLocale(undefined)).toBe('id');
  });

  it('maps app locales to regional Intl locales', () => {
    expect(intlLocale('id')).toBe('id-ID');
    expect(intlLocale('en')).toBe('en-US');
  });
});
