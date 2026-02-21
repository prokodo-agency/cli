import React from 'react';
import ComponentCreator from '@docusaurus/ComponentCreator';

export default [
  {
    path: '/de/docs',
    component: ComponentCreator('/de/docs', 'b9d'),
    routes: [
      {
        path: '/de/docs',
        component: ComponentCreator('/de/docs', '837'),
        routes: [
          {
            path: '/de/docs',
            component: ComponentCreator('/de/docs', '4b5'),
            routes: [
              {
                path: '/de/docs/',
                component: ComponentCreator('/de/docs/', 'b73'),
                exact: true,
                sidebar: "cliSidebar"
              },
              {
                path: '/de/docs/changelog',
                component: ComponentCreator('/de/docs/changelog', '2fe'),
                exact: true,
                sidebar: "cliSidebar"
              },
              {
                path: '/de/docs/ci-cd',
                component: ComponentCreator('/de/docs/ci-cd', 'def'),
                exact: true,
                sidebar: "cliSidebar"
              },
              {
                path: '/de/docs/commands/auth',
                component: ComponentCreator('/de/docs/commands/auth', 'e18'),
                exact: true,
                sidebar: "cliSidebar"
              },
              {
                path: '/de/docs/commands/credits',
                component: ComponentCreator('/de/docs/commands/credits', '245'),
                exact: true,
                sidebar: "cliSidebar"
              },
              {
                path: '/de/docs/commands/doctor',
                component: ComponentCreator('/de/docs/commands/doctor', '831'),
                exact: true,
                sidebar: "cliSidebar"
              },
              {
                path: '/de/docs/commands/init',
                component: ComponentCreator('/de/docs/commands/init', 'a1d'),
                exact: true,
                sidebar: "cliSidebar"
              },
              {
                path: '/de/docs/commands/overview',
                component: ComponentCreator('/de/docs/commands/overview', 'a63'),
                exact: true,
                sidebar: "cliSidebar"
              },
              {
                path: '/de/docs/commands/verify',
                component: ComponentCreator('/de/docs/commands/verify', '841'),
                exact: true,
                sidebar: "cliSidebar"
              },
              {
                path: '/de/docs/configuration',
                component: ComponentCreator('/de/docs/configuration', '053'),
                exact: true,
                sidebar: "cliSidebar"
              },
              {
                path: '/de/docs/getting-started/installation',
                component: ComponentCreator('/de/docs/getting-started/installation', '7f3'),
                exact: true,
                sidebar: "cliSidebar"
              },
              {
                path: '/de/docs/getting-started/quick-start',
                component: ComponentCreator('/de/docs/getting-started/quick-start', 'e41'),
                exact: true,
                sidebar: "cliSidebar"
              },
              {
                path: '/de/docs/global-options',
                component: ComponentCreator('/de/docs/global-options', '643'),
                exact: true,
                sidebar: "cliSidebar"
              },
              {
                path: '/de/docs/troubleshooting',
                component: ComponentCreator('/de/docs/troubleshooting', 'ee9'),
                exact: true,
                sidebar: "cliSidebar"
              },
              {
                path: '/de/docs/versions',
                component: ComponentCreator('/de/docs/versions', 'cca'),
                exact: true,
                sidebar: "cliSidebar"
              }
            ]
          }
        ]
      }
    ]
  },
  {
    path: '/de/',
    component: ComponentCreator('/de/', '09a'),
    exact: true
  },
  {
    path: '*',
    component: ComponentCreator('*'),
  },
];
