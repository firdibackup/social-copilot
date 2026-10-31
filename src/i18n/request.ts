import {getRequestConfig} from 'next-intl/server';
import {getUserLocale} from './locale';
import {loadMessages} from './messages';

export default getRequestConfig(async ({locale: localeOverride}) => {
  const locale = localeOverride ?? (await getUserLocale());

  return {
    locale,
    messages: await loadMessages(locale),
    timeZone: 'Asia/Jakarta'
  };
});
