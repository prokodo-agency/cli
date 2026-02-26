import { themes as prismThemes } from 'prism-react-renderer';
import webpack from 'webpack';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'prokodo CLI',
  tagline: 'Verify, inspect and manage your prokodo projects from the terminal.',
  favicon: 'img/favicon.ico',

  url: 'https://docs.cli.prokodo.com',
  baseUrl: '/',

  organizationName: 'prokodo-agency',
  projectName: 'cli',

  onBrokenLinks: 'throw',
  onBrokenAnchors: 'ignore',

  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'de'],
    localeConfigs: {
      en: { label: 'English', direction: 'ltr', htmlLang: 'en' },
      de: { label: 'Deutsch', direction: 'ltr', htmlLang: 'de' },
    },
  },

  // Load brand fonts from Google Fonts
  headTags: [
    {
      tagName: 'link',
      attributes: { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
    },
    {
      tagName: 'link',
      attributes: {
        rel: 'preconnect',
        href: 'https://fonts.gstatic.com',
        crossorigin: 'anonymous',
      },
    },
    {
      tagName: 'link',
      attributes: {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;700;900&family=Open+Sans:wght@400;500;700&display=swap',
      },
    },
  ],

  plugins: [
    function defineProcessEnv() {
      return {
        name: 'define-process-env',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        configureWebpack(_config: any) {
          return {
            plugins: [
              new webpack.DefinePlugin({
                // @prokodo/ui uses process.env.MODE for environment detection.
                // Force 'production' so Icon always loads SVGs from the jsDelivr CDN
                // rather than a local /assets/icons/ path that doesn't exist in Docusaurus.
                'process.env': JSON.stringify({ MODE: 'production' }),
              }),
            ],
          };
        },
      };
    },
  ],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/prokodo-agency/cli/edit/main/public/docs/',
          showLastUpdateAuthor: true,
          showLastUpdateTime: true,
          // Versioning — label the current (unreleased) track.
          // To freeze a release: run `docusaurus docs:version <version>`,
          // then add an entry to `versions` below and update `lastVersion`.
          lastVersion: 'current',
          versions: {
            current: {
              label: '0.1.1',
              badge: true,
              banner: 'none',
            },
          },
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/prokodo-og.png',

    metadata: [
      {
        name: 'keywords',
        content:
          'prokodo CLI, prokodo command line, prokodo verify, n8n marketplace CLI, prokodo docs',
      },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:site', content: '@prokodo_agency' },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'prokodo CLI Docs' },
    ],

    colorMode: {
      defaultMode: 'dark',
      disableSwitch: false,
      respectPrefersColorScheme: true,
    },

    navbar: {
      title: 'prokodo CLI',
      logo: {
        alt: 'prokodo logo',
        src: 'img/prokodo-logo-icon.webp',
        srcDark: 'img/prokodo-logo-icon.webp',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'cliSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          href: 'https://www.n8n-marketplace.prokodo.com',
          label: 'Marketplace',
          position: 'right',
        },
        {
          href: 'https://github.com/prokodo-agency/cli',
          label: 'GitHub',
          position: 'right',
        },
        {
          type: 'localeDropdown',
          position: 'right',
        },
      ],
    },

    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Getting Started', to: '/docs/getting-started/installation' },
            { label: 'Commands', to: '/docs/commands/overview' },
            { label: 'Configuration', to: '/docs/configuration' },
            { label: 'CI/CD', to: '/docs/ci-cd' },
          ],
        },
        {
          title: 'Commands',
          items: [
            { label: 'auth', to: '/docs/commands/auth' },
            { label: 'init', to: '/docs/commands/init' },
            { label: 'verify', to: '/docs/commands/verify' },
            { label: 'credits', to: '/docs/commands/credits' },
            { label: 'doctor', to: '/docs/commands/doctor' },
          ],
        },
        {
          title: 'Releases',
          items: [
            { label: 'Versions', to: '/docs/versions' },
            { label: 'Changelog', to: '/docs/changelog' },
            { label: 'npm', href: 'https://www.npmjs.com/package/@prokodo/cli' },
            { label: 'GitHub Releases', href: 'https://github.com/prokodo-agency/cli/releases' },
          ],
        },
        {
          title: 'prokodo',
          items: [
            { label: 'Marketplace', href: 'https://www.n8n-marketplace.prokodo.com' },
            { label: 'Website', href: 'https://www.prokodo.com' },
            { label: 'GitHub', href: 'https://github.com/prokodo-agency' },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} prokodo. Built with Docusaurus.`,
    },

    prism: {
      theme: prismThemes.oneDark,
      darkTheme: prismThemes.oneDark,
      additionalLanguages: ['bash', 'json', 'yaml', 'typescript'],
    },

    algolia: undefined,
  } satisfies Preset.ThemeConfig,
};

export default config;
