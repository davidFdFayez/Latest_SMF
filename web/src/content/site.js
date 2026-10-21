import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useContent, useText } from './useContent';

/**
 * Site-wide content for the layout and the contact blocks: federation name and
 * logos, contact details, social accounts ("site"), and menu wording
 * ("navigation"). Both are preloaded by the layout.
 *
 * Until they arrive on a visitor's very first page load, labels fall back to
 * the built-in i18n wording; after that they come from the cache.
 */
export function useSiteContent() {
  const { content: site } = useContent('site');
  const { content: navigation } = useContent('navigation');
  const tx = useText();
  const { t } = useTranslation();

  /** A menu label by key, e.g. navLabel('federationValues'). A blank label falls back too. */
  const navLabel = useCallback(
    (key) => (navigation ? tx(navigation.menu?.[key]) : '') || t(`nav.${key}`),
    [navigation, tx, t],
  );

  return { site, navigation, navLabel, tx };
}
