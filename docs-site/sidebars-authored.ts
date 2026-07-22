import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

/**
 * HAND-AUTHORED sidebars for the net-new sections (phases C4/C4b) — the Intellisper Agent and Memory
 * tabs. These are NOT derived from the legacy Mintlify inventory (there was nothing to port), so they
 * live here and are merged into the generated `sidebars.ts` by `docs/rewrite/gen-sidebars.cjs`
 * (which imports and spreads this module). Keep this file the single source of truth for those two
 * sidebars; edit it directly, then re-run the generator.
 */
const authoredSidebars: SidebarsConfig = {
    agent: [
        'agent/overview',
        'agent/get-started',
        {
            type: 'category',
            label: 'Using the agent',
            collapsed: false,
            items: [
                'agent/chat-and-runs',
                'agent/routines',
                'agent/automation',
                'agent/files',
                'agent/research',
                'agent/grammar-and-quick-tools',
            ],
        },
        {
            type: 'category',
            label: 'Manage & monitor',
            collapsed: false,
            items: [
                'agent/monitoring',
                'agent/plans-and-limits',
                'agent/api-reference',
            ],
        },
    ],
    memory: [
        'memory/overview',
        {
            type: 'category',
            label: 'The three scopes',
            collapsed: false,
            items: [
                'memory/my-memory',
                'memory/org-memory',
                'memory/flow-memory',
            ],
        },
        {
            type: 'category',
            label: 'Privacy & control',
            collapsed: false,
            items: [
                'memory/privacy-and-sharing',
                'memory/settings',
                'memory/export-and-delete',
                'memory/safety',
            ],
        },
        {
            type: 'category',
            label: 'Administer',
            collapsed: false,
            items: [
                'memory/admin-governance',
                'memory/plans-and-limits',
            ],
        },
    ],
};

/**
 * NET-NEW pages that belong inside an EXISTING (legacy-derived) sidebar rather than a new tab
 * (phase C4c — shipped-but-undocumented features). Keyed by the target sidebar id; the generator
 * (`gen-sidebars.cjs`) appends each array's categories to that sidebar after its legacy groups.
 * This is how a net-new "Tables" or "Knowledge base" page lands under Intellisper Studio / Admin Guide
 * without hand-editing the generated file.
 *
 * SECURITY NOTE (owner hard requirement): only user-facing, low-attack-surface features are listed
 * here. Internal/operator surfaces, secrets/auth internals, security-control mechanics and infra
 * internals are deliberately NOT documented. See docs/rewrite/_c4c-triage.md for the full decisions.
 */
export const authoredAdditions: Record<string, any[]> = {
    studio: [
        {
            type: 'category',
            label: 'Tables',
            collapsed: false,
            items: [
                'tables/overview',
                'tables/fields-and-records',
                'tables/table-webhooks',
            ],
        },
        {
            type: 'category',
            label: 'Knowledge base',
            collapsed: false,
            items: [
                'knowledge-base/overview',
            ],
        },
        {
            type: 'category',
            label: 'Assistants',
            collapsed: false,
            items: [
                'assistants/copilot',
                'assistants/chat',
            ],
        },
    ],
    'admin-guide': [
        {
            type: 'category',
            label: 'Usage & analytics',
            collapsed: false,
            items: [
                'admin-observability/ai-usage',
                'admin-observability/chat-analytics',
                'admin-observability/alerts',
            ],
        },
        {
            type: 'category',
            label: 'Plans & entitlements',
            collapsed: false,
            items: [
                'plans/overview',
            ],
        },
    ],
};

export default authoredSidebars;
