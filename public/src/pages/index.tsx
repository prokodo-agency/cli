import type { ReactNode } from 'react';
import clsx from 'clsx';
import DocLink from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import { Headline } from '@prokodo/ui/headline';
import { Button } from '@prokodo/ui/button';
import { Card } from '@prokodo/ui/card';
import { Icon } from '@prokodo/ui/icon';
import type { IconName } from '@prokodo/ui/icon';

import styles from './index.module.css';

// ─── Feature definitions ──────────────────────────────────────────────────────

interface Feature {
  icon: IconName;
  title: string;
  description: string;
  href: string;
}

const FEATURES: Feature[] = [
  {
    icon: 'Shield01Icon',
    title: 'auth',
    description:
      'Securely store, rotate, and inspect your API key. Credentials are saved at ~/.config/prokodo with 0600 permissions.',
    href: '/docs/commands/auth',
  },
  {
    icon: 'CodeFolderIcon',
    title: 'init',
    description:
      'Scaffold .prokodo/config.json in seconds. Set a project slug, glob patterns, and timeout — everything verify needs.',
    href: '/docs/commands/init',
  },
  {
    icon: 'CheckmarkCircle01Icon',
    title: 'verify',
    description:
      'Upload your project files and trigger a cloud verification run. Stream logs in real-time, get a structured result.',
    href: '/docs/commands/verify',
  },
  {
    icon: 'CreditCardIcon',
    title: 'credits',
    description:
      'Check your credit balance at any time. Combine with --json for scripting or dashboard integrations.',
    href: '/docs/commands/credits',
  },
  {
    icon: 'StethoscopeIcon',
    title: 'doctor',
    description:
      'Diagnose your environment with one command. Checks Node version, credentials, config file, and API reachability.',
    href: '/docs/commands/doctor',
  },
  {
    icon: 'Rocket01Icon',
    title: 'CI-first design',
    description:
      'Every command supports --json output, environment-variable auth (PROKODO_API_KEY), and exits with predictable codes.',
    href: '/docs/ci-cd',
  },
];

// ─── Components ───────────────────────────────────────────────────────────────

function FeatureCard({ icon, title, description, href }: Feature): ReactNode {
  return (
    <div className={clsx('col col--4', styles.featureCol)}>
      <DocLink to={href} className={styles.featureCardLink}>
        <Card
          variant="panel"
          enableShadow
          animated={false}
          className={clsx('prokodo-docs--feature-card', styles.featureCardHost)}
        >
          <div className="prokodo-docs--feature-icon">
            <Icon name={icon} size="lg" />
          </div>
          <div className="prokodo-docs--feature-title">{title}</div>
          <p>{description}</p>
        </Card>
      </DocLink>
    </div>
  );
}

function HeroSection(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  const logoSrc = useBaseUrl('/img/prokodo-logo-white.webp');
  return (
    <header className={clsx('hero hero--prokodo', styles.heroBanner)}>
      <div className="container">
        <h1 className={styles.heroTitle}>
          {/* Image is decorative — visually hidden span carries the text for SEO */}
          <img src={logoSrc} alt="" aria-hidden="true" className={styles.heroWordmark} />
          <span className={styles.heroSrOnly}>prokodo</span>
          {' CLI'}
        </h1>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={clsx(styles.heroCtas, 'prokodo-docs--hero-cta')}>
          <Button
            color="primary"
            variant="contained"
            title="Get Started →"
            redirect={{ href: '/docs/getting-started/installation' }}
          />
          <Button
            color="primary"
            variant="outlined"
            title="Command Reference"
            redirect={{ href: '/docs/commands/overview' }}
          />
        </div>
        <div className={styles.heroInstall}>
          <code>npm install -g @prokodo/cli</code>
        </div>
      </div>
    </header>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home(): ReactNode {
  return (
    <Layout
      title="prokodo CLI — Developer Documentation"
      description="Official documentation for the prokodo CLI. Verify, inspect, and manage your prokodo projects from the terminal."
    >
      <HeroSection />

      <main>
        {/* Quick-start strip */}
        <section className={styles.quickStart}>
          <div className="container">
            <Headline type="h2" className={styles.sectionHeading} animated={false}>
              Up and running in 60 seconds
            </Headline>
            <div className={styles.codeStrip}>
              <DocLink to="/docs/getting-started/installation" className={styles.codeStep}>
                <div className={styles.stepHeader}>
                  <span className={styles.stepNum}>1</span>
                  <span className={styles.stepLabel}>Install</span>
                </div>
                <code>npm install -g @prokodo/cli</code>
              </DocLink>
              <DocLink to="/docs/commands/auth" className={styles.codeStep}>
                <div className={styles.stepHeader}>
                  <span className={styles.stepNum}>2</span>
                  <span className={styles.stepLabel}>Authenticate</span>
                </div>
                <code>prokodo auth login --key pk_live_…</code>
              </DocLink>
              <DocLink to="/docs/commands/init" className={styles.codeStep}>
                <div className={styles.stepHeader}>
                  <span className={styles.stepNum}>3</span>
                  <span className={styles.stepLabel}>Configure</span>
                </div>
                <code>prokodo init --slug my-project</code>
              </DocLink>
              <DocLink to="/docs/commands/verify" className={styles.codeStep}>
                <div className={styles.stepHeader}>
                  <span className={styles.stepNum}>4</span>
                  <span className={styles.stepLabel}>Verify</span>
                </div>
                <code>prokodo verify</code>
              </DocLink>
            </div>
          </div>
        </section>

        {/* Feature grid */}
        <section className={styles.features}>
          <div className="container">
            <Headline type="h2" className={styles.sectionHeading} animated={false}>
              Everything you need
            </Headline>
            <div className="row">
              {FEATURES.map((f) => (
                <FeatureCard key={f.title} {...f} />
              ))}
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
