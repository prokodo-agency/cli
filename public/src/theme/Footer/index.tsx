import type { ReactNode } from 'react';
import DocLink from '@docusaurus/Link';
import { Icon, type IconName } from '@prokodo/ui/icon';
import { MARKETPLACE_URL, PROKODO_URL, GITHUB_URL, LINKEDIN_URL } from '../../constants';

import styles from './index.module.css';

// ─── Footer data ──────────────────────────────────────────────────────────────

type FooterLink =
  | { label: string; to: string; href?: never }
  | { label: string; href: string; to?: never };

const SECTIONS: Array<{ title: string; links: FooterLink[] }> = [
  {
    title: 'Docs',
    links: [
      { label: 'Getting Started', to: '/docs/getting-started/installation' },
      { label: 'Commands', to: '/docs/commands/overview' },
      { label: 'Configuration', to: '/docs/configuration' },
      { label: 'CI / CD', to: '/docs/ci-cd' },
      { label: 'Troubleshooting', to: '/docs/troubleshooting' },
    ],
  },
  {
    title: 'Commands',
    links: [
      { label: 'auth', to: '/docs/commands/auth' },
      { label: 'init', to: '/docs/commands/init' },
      { label: 'verify', to: '/docs/commands/verify' },
      { label: 'credits', to: '/docs/commands/credits' },
      { label: 'doctor', to: '/docs/commands/doctor' },
    ],
  },
  {
    title: 'prokodo',
    links: [
      { label: 'Marketplace', href: MARKETPLACE_URL },
      { label: 'Website', href: PROKODO_URL },
      { label: 'GitHub', href: GITHUB_URL },
    ],
  },
];

const SOCIALS: Array<{ name: IconName; href: string; label: string }> = [
  { name: 'GithubIcon', href: GITHUB_URL, label: 'GitHub' },
  { name: 'Linkedin01Icon', href: LINKEDIN_URL, label: 'LinkedIn' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function Footer(): ReactNode {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>

        {/* Brand column */}
        <div className={styles.brand}>
          <a href={PROKODO_URL} target="_blank" rel="noopener noreferrer" className={styles.brandLogoLink}>
            <img
              src="/img/prokodo-logo.webp"
              alt="prokodo"
              className={styles.brandLogoLight}
            />
            <img
              src="/img/prokodo-logo-white.webp"
              alt="prokodo"
              className={styles.brandLogoDark}
            />
          </a>
          <p className={styles.tagline}>
            Verify, inspect and manage your prokodo projects from the terminal.
          </p>
          <div className={styles.socials}>
            {SOCIALS.map((s) => (
              <a
                key={s.name}
                href={s.href}
                aria-label={s.label}
                className={styles.socialLink}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon name={s.name} size="md" />
              </a>
            ))}
          </div>
        </div>

        {/* Link columns */}
        <div className={styles.linkGroups}>
          {SECTIONS.map((section) => (
            <div key={section.title} className={styles.section}>
              <div className={styles.sectionTitle}>{section.title}</div>
              <ul className={styles.linkList}>
                {section.links.map((link) => (
                  <li key={link.label}>
                    <DocLink
                      to={link.to}
                      href={link.href}
                      className={styles.footerLink}
                    >
                      {link.label}
                    </DocLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom bar */}
      <div className={styles.bottom}>
        <p className={styles.copyright}>
          Copyright © {new Date().getFullYear()} prokodo.
        </p>
        <div className={styles.bottomLinks}>
          <DocLink href={`${MARKETPLACE_URL}/en/legal/`} className={styles.bottomLink}>Legal</DocLink>
          <DocLink href={`${MARKETPLACE_URL}/en/legal/imprint/`} className={styles.bottomLink}>Imprint</DocLink>
        </div>
      </div>
    </footer>
  );
}
