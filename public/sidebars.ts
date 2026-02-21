import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  cliSidebar: [
    {
      type: 'doc',
      id: 'intro',
      label: '👋 Introduction',
    },
    {
      type: 'category',
      label: 'Getting Started',
      collapsed: false,
      items: [
        'getting-started/installation',
        'getting-started/quick-start',
      ],
    },
    {
      type: 'category',
      label: 'Commands',
      collapsed: false,
      items: [
        'commands/overview',
        'commands/auth',
        'commands/init',
        'commands/verify',
        'commands/credits',
        'commands/doctor',
      ],
    },
    {
      type: 'doc',
      id: 'global-options',
      label: '🌐 Global Options',
    },
    {
      type: 'doc',
      id: 'configuration',
      label: '⚙️ Configuration',
    },
    {
      type: 'doc',
      id: 'ci-cd',
      label: '🔄 CI/CD Integration',
    },
    {
      type: 'doc',
      id: 'troubleshooting',
      label: '🛠 Troubleshooting',
    },
    {
      type: 'doc',
      id: 'versions',
      label: '🏷 Versions',
    },
    {
      type: 'doc',
      id: 'changelog',
      label: '📋 Changelog',
    },
  ],
};

export default sidebars;
