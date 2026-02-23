import type { ReactNode } from 'react';
import DocLink from '@docusaurus/Link';
import Translate, { translate } from '@docusaurus/Translate';
import { Icon, type IconName } from '@prokodo/ui/icon';
import { MARKETPLACE_URL, PROKODO_URL, GITHUB_URL, LINKEDIN_URL } from '../../constants';

import styles from './index.module.css';

// ─── Footer data ──────────────────────────────────────────────────────────────

type FooterLink =
  | { label: string; to: string; href?: never }
  | { label: string; href: string; to?: never };

const SOCIALS: Array<{ name: IconName; href: string; labelId: string; defaultLabel: string }> = [
  {
    name: 'GithubIcon',
    href: GITHUB_URL,
    labelId: 'prokodo.footer.social.github',
    defaultLabel: 'GitHub',
  },
  {
    name: 'Linkedin01Icon',
    href: LINKEDIN_URL,
    labelId: 'prokodo.footer.social.linkedin',
    defaultLabel: 'LinkedIn',
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function Footer(): ReactNode {
  const sections: Array<{ titleId: string; defaultTitle: string; links: FooterLink[] }> = [
    {
      titleId: 'prokodo.footer.section.docs',
      defaultTitle: 'Docs',
      links: [
        {
          label: translate({
            id: 'prokodo.footer.link.gettingStarted',
            message: 'Getting Started',
          }),
          to: '/docs/getting-started/installation',
        },
        {
          label: translate({ id: 'prokodo.footer.link.commands', message: 'Commands' }),
          to: '/docs/commands/overview',
        },
        {
          label: translate({ id: 'prokodo.footer.link.configuration', message: 'Configuration' }),
          to: '/docs/configuration',
        },
        {
          label: translate({ id: 'prokodo.footer.link.cicd', message: 'CI / CD' }),
          to: '/docs/ci-cd',
        },
        {
          label: translate({
            id: 'prokodo.footer.link.troubleshooting',
            message: 'Troubleshooting',
          }),
          to: '/docs/troubleshooting',
        },
      ],
    },
    {
      titleId: 'prokodo.footer.section.commands',
      defaultTitle: 'Commands',
      links: [
        { label: 'auth', to: '/docs/commands/auth' },
        { label: 'init', to: '/docs/commands/init' },
        { label: 'verify', to: '/docs/commands/verify' },
        { label: 'credits', to: '/docs/commands/credits' },
        { label: 'doctor', to: '/docs/commands/doctor' },
      ],
    },
    {
      titleId: 'prokodo.footer.section.prokodo',
      defaultTitle: 'prokodo',
      links: [
        {
          label: translate({ id: 'prokodo.footer.link.marketplace', message: 'Marketplace' }),
          href: MARKETPLACE_URL,
        },
        {
          label: translate({ id: 'prokodo.footer.link.website', message: 'Website' }),
          href: PROKODO_URL,
        },
        {
          label: translate({ id: 'prokodo.footer.link.github', message: 'GitHub' }),
          href: GITHUB_URL,
        },
      ],
    },
  ];

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        {/* Brand column */}
        <div className={styles.brand}>
          <a
            href={PROKODO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.brandLogoLink}
          >
            <img src="/img/prokodo-logo.webp" alt="prokodo" className={styles.brandLogoLight} />
            <img
              src="/img/prokodo-logo-white.webp"
              alt="prokodo"
              className={styles.brandLogoDark}
            />
          </a>
          <p className={styles.tagline}>
            <Translate id="prokodo.footer.tagline">
              Verify, inspect and manage your prokodo projects from the terminal.
            </Translate>
          </p>
          <div className={styles.socials}>
            {SOCIALS.map((s) => (
              <a
                key={s.name}
                href={s.href}
                aria-label={translate({ id: s.labelId, message: s.defaultLabel })}
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
          {sections.map((section) => (
            <div key={section.titleId} className={styles.section}>
              <div className={styles.sectionTitle}>
                <Translate id={section.titleId}>{section.defaultTitle}</Translate>
              </div>
              <ul className={styles.linkList}>
                {section.links.map((link) => (
                  <li key={link.label}>
                    <DocLink to={link.to} href={link.href} className={styles.footerLink}>
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
          {translate(
            { id: 'prokodo.footer.copyright', message: 'Copyright © {year} prokodo.' },
            { year: String(new Date().getFullYear()) },
          )}
        </p>
        <div className={styles.bottomLinks}>
          <DocLink href={`${MARKETPLACE_URL}/en/legal/`} className={styles.bottomLink}>
            <Translate id="prokodo.footer.link.legal">Legal</Translate>
          </DocLink>
          <DocLink href={`${MARKETPLACE_URL}/en/legal/imprint/`} className={styles.bottomLink}>
            <Translate id="prokodo.footer.link.imprint">Imprint</Translate>
          </DocLink>
        </div>
      </div>
    </footer>
  );
}
