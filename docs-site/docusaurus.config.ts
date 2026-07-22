import type * as Preset from '@docusaurus/preset-classic';
import type {Config} from '@docusaurus/types';
import {themes as prismThemes} from 'prism-react-renderer';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

/**
 * Intellisper documentation site.
 *
 * Migration target for the legacy Mintlify docs in `../docs` (see
 * `../docs/rewrite/docs-overhaul-implementation-plan.md`). `../docs` stays untouched and authoritative
 * until this site reaches parity and the C6 cutover.
 *
 * TODO(C1): the production URLs below are PLACEHOLDERS. The canonical Intellisper app/marketing/docs
 * domains, GitHub org and socials are collected from code/config and confirmed with the owner in
 * phase C1 (the rebrand batch) — they are deliberately not invented here.
 */
const config: Config = {
  title: 'Intellisper',
  tagline: 'Automate your work — in your browser and across your apps',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://docs.intellisper.com',
  baseUrl: '/',

  organizationName: 'Kurvant',
  projectName: 'Intellisper',

  // A dangling internal link must never ship. Set to 'warn' ONLY for the migration window: 3 known
  // links point at deliberately-absent content and need an editorial decision in C1, not a script
  // hack (see docs/rewrite/_broken-links-todo.md):
  //   2x /handbook/**            -> the Handbook is withheld from the public site (page-map §2b)
  //   1x /endpoints/embedding/** -> a deferred OpenAPI stub, regenerated in M4 (currently blocked)
  // MUST return to 'throw' at C6 cutover — the C6 gate asserts it.
  onBrokenLinks: 'warn',

  markdown: {
    hooks: {
      // v4-forward form of the deprecated `onBrokenMarkdownLinks`.
      onBrokenMarkdownLinks: 'throw',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  // The three mockups share this type system: Playfair Display (display headings), Hanken Grotesk
  // (body), JetBrains Mono (code). custom.css sets the families; these must actually load them or
  // the site silently falls back to system fonts and looks nothing like the design.
  stylesheets: [
    {
      href: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap',
      type: 'text/css',
    },
  ],

  // Without these the font CSS costs a full DNS+TLS round-trip before first paint.
  headTags: [
    {
      tagName: 'link',
      attributes: {rel: 'preconnect', href: 'https://fonts.googleapis.com'},
    },
    {
      tagName: 'link',
      attributes: {rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: 'anonymous'},
    },
  ],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          // `docs` is the whole site — there is no separate landing page to fall back to.
          routeBasePath: '/',
          // The OpenAPI theme renders API pages; the docs plugin must hand them to it.
          docItemComponent: '@theme/ApiItem',
          showLastUpdateTime: true,
        },
        // No blog: the Mintlify site has none, and an empty /blog would 404 in the navbar.
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  plugins: [
    [
      'docusaurus-plugin-openapi-docs',
      {
        id: 'api',
        docsPluginId: 'classic',
        config: {
          intellisper: {
            // Regenerated from the live server route schemas (docs/rewrite/gen-openapi.ts) and filtered
            // to the published public surface (docs/rewrite/filter-openapi.cjs): 80 operations / 57 paths
            // / 21 tags. Internal control-plane groups (browser-agent, ai-gateway, memory, variables) and
            // non-public groups (chat) are intentionally excluded — they still serve at runtime.
            specPath: '../docs/openapi.json',
            outputDir: 'docs/api-reference',
            sidebarOptions: {
              groupPathsBy: 'tag',
              categoryLinkSource: 'tag',
            },
          },
        },
      },
    ],
    [
      // Local, offline search — no external account, index built at build time.
      require.resolve('@easyops-cn/docusaurus-search-local'),
      {
        hashed: true,
        indexBlog: false,
        docsRouteBasePath: '/',
      },
    ],
  ],

  themes: ['docusaurus-theme-openapi-docs'],

  themeConfig: {
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Intellisper',
      logo: {
        alt: 'Intellisper',
        src: 'img/logo.svg',
        // The site has no page at `/` (routeBasePath is '/', and the front door is the Overview
        // welcome page). Without this the logo links to a non-existent root on every page.
        href: '/overview/welcome',
      },
      // Tabs per the approved page map (docs-overhaul-page-map.md §2). Handbook is deliberately
      // ABSENT — internal-facing, withheld from the public site (§2b).
      // `agent` and `memory` land in phases C4/C4b (net-new content).
      items: [
        {type: 'docSidebar', sidebarId: 'overview', position: 'left', label: 'Overview'},
        {type: 'docSidebar', sidebarId: 'studio', position: 'left', label: 'Intellisper Studio'},
        {type: 'docSidebar', sidebarId: 'agent', position: 'left', label: 'Intellisper Agent'},
        {type: 'docSidebar', sidebarId: 'memory', position: 'left', label: 'Memory'},
        {type: 'docSidebar', sidebarId: 'admin-guide', position: 'left', label: 'Admin Guide'},
        {type: 'docSidebar', sidebarId: 'deploy', position: 'left', label: 'Deploy'},
        {type: 'docSidebar', sidebarId: 'embedding', position: 'left', label: 'Embedding'},
        {type: 'docSidebar', sidebarId: 'build-blocks', position: 'left', label: 'Build Blocks'},
        {type: 'docSidebar', sidebarId: 'api-reference', position: 'left', label: 'API Reference'},
      ],
    },
    footer: {
      style: 'dark',
      links: [],
      copyright: `Copyright © ${new Date().getFullYear()} Kurvant.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'json', 'diff', 'yaml'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
