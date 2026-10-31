import {NextIntlClientProvider} from 'next-intl';
import type {ReactNode} from 'react';
import {getUserLocale} from './locale';
import {loadMessages, type MessageNamespace} from './messages';

interface IntlMessagesProps {
  children: ReactNode;
  namespaces: readonly MessageNamespace[];
}

/**
 * Wrap a large client island with only the namespaces it needs. Nested providers
 * replace (rather than merge) messages, so include `common` when the island uses it.
 */
export async function IntlMessages({children, namespaces}: IntlMessagesProps) {
  const locale = await getUserLocale();
  const allMessages = await loadMessages(locale);
  const messages = Object.fromEntries(namespaces.map((namespace) => [namespace, allMessages[namespace]]));

  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Jakarta">
      {children}
    </NextIntlClientProvider>
  );
}
