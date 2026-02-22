import type { ReactNode } from 'react';
import { useState } from 'react';
import clsx from 'clsx';
import DocLink from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import { useColorMode } from '@docusaurus/theme-common';
import { useAlternatePageUtils } from '@docusaurus/theme-common/internal';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Translate, { translate } from '@docusaurus/Translate';
import { Icon } from '@prokodo/ui/icon';

import styles from './index.module.css';
import { MARKETPLACE_URL, GITHUB_CLI_URL } from '../../constants';

// ─── Nav structure ────────────────────────────────────────────────────────────

type NavItem = { label: string } & ({ to: string; href?: never } | { href: string; to?: never });

// ─── Component ────────────────────────────────────────────────────────────────

export default function Navbar(): ReactNode {
  const { colorMode, setColorMode } = useColorMode();
  const [mobileOpen, setMobileOpen] = useState(false);
  const {
    i18n: { currentLocale, locales },
  } = useDocusaurusContext();
  const { createUrl } = useAlternatePageUtils();

  const otherLocale = locales.find((l) => l !== currentLocale);
  const otherLocaleUrl = otherLocale
    ? createUrl({ locale: otherLocale, fullyQualified: false })
    : undefined;

  const logoSrc = useBaseUrl(
    colorMode === 'dark' ? '/img/prokodo-logo-icon.webp' : '/img/prokodo-logo-icon.webp',
  );

  const isDark = colorMode === 'dark';
  const nextColorMode = isDark ? 'light' : 'dark';

  const navLinks: NavItem[] = [
    {
      label: translate({ id: 'prokodo.navbar.link.docs', message: 'Docs' }),
      to: '/docs/',
    },
    {
      label: translate({ id: 'prokodo.navbar.link.marketplace', message: 'Marketplace' }),
      href: MARKETPLACE_URL,
    },
  ];

  const toggleTheme = () => setColorMode(isDark ? 'light' : 'dark');

  return (
    <nav className={clsx('navbar', styles.navbar)}>
      <div className={styles.inner}>
        {/* Left: brand + nav links */}
        <div className={styles.leftGroup}>
          <DocLink to="/" className={styles.brand}>
            <img src={logoSrc} alt="prokodo" className={styles.brandLogo} />
            <span className={styles.brandName}>CLI</span>
          </DocLink>

          <ul className={styles.navLinks}>
            {navLinks.map((item) => (
              <li key={item.label}>
                <DocLink to={item.to} href={item.href} className={styles.navLink}>
                  {item.label}
                </DocLink>
              </li>
            ))}
          </ul>
        </div>

        {/* Right: locale toggle + theme toggle + GitHub icon */}
        <div className={styles.actions}>
          {otherLocale && otherLocaleUrl && (
            <a
              href={otherLocaleUrl}
              className={styles.localeToggle}
              aria-label={translate(
                {
                  id: 'prokodo.navbar.localeSwitch.ariaLabel',
                  message: 'Switch language to {locale}',
                },
                { locale: otherLocale },
              )}
            >
              {otherLocale.toUpperCase()}
            </a>
          )}

          <button
            type="button"
            className={styles.themeToggle}
            onClick={toggleTheme}
            aria-label={translate(
              {
                id: 'prokodo.navbar.themeToggle.ariaLabel',
                message: 'Switch to {mode} mode',
              },
              { mode: nextColorMode },
            )}
          >
            <Icon name={isDark ? 'Sun01Icon' : 'Moon02Icon'} size="sm" />
          </button>

          <a
            href={GITHUB_CLI_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.themeToggle}
            aria-label={translate({ id: 'prokodo.navbar.github.ariaLabel', message: 'GitHub' })}
          >
            <Icon name="GithubIcon" size="sm" />
          </a>
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          className={styles.hamburger}
          onClick={() => setMobileOpen((o) => !o)}
          aria-label={translate({
            id: 'prokodo.navbar.hamburger.ariaLabel',
            message: 'Toggle navigation menu',
          })}
          aria-expanded={mobileOpen}
        >
          <Icon name={mobileOpen ? 'Cancel01Icon' : 'Menu01Icon'} size="md" />
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className={styles.mobileMenu}>
          {navLinks.map((item) => (
            <DocLink
              key={item.label}
              to={item.to}
              href={item.href}
              className={styles.mobileLink}
              onClick={() => setMobileOpen(false)}
            >
              {item.label}
            </DocLink>
          ))}
          <DocLink
            href={GITHUB_CLI_URL}
            className={styles.mobileLink}
            onClick={() => setMobileOpen(false)}
          >
            <Icon name="GithubIcon" size="xs" />
            {' '}
            <Translate id="prokodo.navbar.mobile.github">GitHub</Translate>
          </DocLink>
          {otherLocale && otherLocaleUrl && (
            <a
              href={otherLocaleUrl}
              className={styles.mobileLink}
              onClick={() => setMobileOpen(false)}
            >
              {otherLocale === 'de'
                ? translate({ id: 'prokodo.navbar.mobile.locale.de', message: '🇩🇪 Deutsch' })
                : translate({ id: 'prokodo.navbar.mobile.locale.en', message: '🇬🇧 English' })}
            </a>
          )}
        </div>
      )}
    </nav>
  );
}
