import type {Locale} from './locale';

import idCommon from '../../messages/id/common.json';
import idShell from '../../messages/id/shell.json';
import idLanding from '../../messages/id/landing.json';
import idAuth from '../../messages/id/auth.json';
import idOnboarding from '../../messages/id/onboarding.json';
import idBilling from '../../messages/id/billing.json';
import idCalendar from '../../messages/id/calendar.json';
import idEditor from '../../messages/id/editor.json';
import idBrand from '../../messages/id/brand.json';
import idAssets from '../../messages/id/assets.json';
import idInbox from '../../messages/id/inbox.json';
import idMimo from '../../messages/id/mimo.json';
import idSettings from '../../messages/id/settings.json';
import idAnalytics from '../../messages/id/analytics.json';
import idNotifications from '../../messages/id/notifications.json';
import idErrors from '../../messages/id/errors.json';
import idAdmin from '../../messages/id/admin.json';
import idLegal from '../../messages/id/legal.json';
import enCommon from '../../messages/en/common.json';
import enShell from '../../messages/en/shell.json';
import enLanding from '../../messages/en/landing.json';
import enAuth from '../../messages/en/auth.json';
import enOnboarding from '../../messages/en/onboarding.json';
import enBilling from '../../messages/en/billing.json';
import enCalendar from '../../messages/en/calendar.json';
import enEditor from '../../messages/en/editor.json';
import enBrand from '../../messages/en/brand.json';
import enAssets from '../../messages/en/assets.json';
import enInbox from '../../messages/en/inbox.json';
import enMimo from '../../messages/en/mimo.json';
import enSettings from '../../messages/en/settings.json';
import enAnalytics from '../../messages/en/analytics.json';
import enNotifications from '../../messages/en/notifications.json';
import enErrors from '../../messages/en/errors.json';
import enAdmin from '../../messages/en/admin.json';
import enLegal from '../../messages/en/legal.json';

export const MESSAGE_NAMESPACES = [
  'common',
  'shell',
  'landing',
  'auth',
  'onboarding',
  'billing',
  'calendar',
  'editor',
  'brand',
  'assets',
  'inbox',
  'mimo',
  'settings',
  'analytics',
  'notifications',
  'errors',
  'admin',
  'legal'
] as const;

export type MessageNamespace = (typeof MESSAGE_NAMESPACES)[number];

export const idMessages = {
  common: idCommon,
  shell: idShell,
  landing: idLanding,
  auth: idAuth,
  onboarding: idOnboarding,
  billing: idBilling,
  calendar: idCalendar,
  editor: idEditor,
  brand: idBrand,
  assets: idAssets,
  inbox: idInbox,
  mimo: idMimo,
  settings: idSettings,
  analytics: idAnalytics,
  notifications: idNotifications,
  errors: idErrors,
  admin: idAdmin,
  legal: idLegal
};

const enMessages: typeof idMessages = {
  common: enCommon,
  shell: enShell,
  landing: enLanding,
  auth: enAuth,
  onboarding: enOnboarding,
  billing: enBilling,
  calendar: enCalendar,
  editor: enEditor,
  brand: enBrand,
  assets: enAssets,
  inbox: enInbox,
  mimo: enMimo,
  settings: enSettings,
  analytics: enAnalytics,
  notifications: enNotifications,
  errors: enErrors,
  admin: enAdmin,
  legal: enLegal
};

const messagesByLocale: Record<Locale, typeof idMessages> = {
  id: idMessages,
  en: enMessages
};

/** Static imports keep every catalog visible to Turbopack. */
export async function loadMessages(locale: Locale): Promise<typeof idMessages> {
  return messagesByLocale[locale];
}
