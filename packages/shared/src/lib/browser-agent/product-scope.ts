import { z } from 'zod'

/**
 * The product a platform is provisioned for. Intellisper ships three subscription surfaces:
 *  - BROWSER    : the browser-automation agent only (the Chrome extension)
 *  - BLOCKUNITS : the workflow-automation platform only (the classic blockunits web app)
 *  - FULL       : both
 *
 * Carried optionally through sign-up / platform creation. It is ADDITIVE and backward-compatible:
 * when absent, a platform behaves exactly as a stock blockunits platform (product = BLOCKUNITS),
 * so existing blockunits sign-up/creation is unaffected. It drives which `platform_plan` flags are
 * set (e.g. `browserAgentEnabled`) and, for BROWSER/FULL, the one-platform-per-email tenancy rule.
 */
export const ProductScope = {
    BROWSER: 'BROWSER',
    BLOCKUNITS: 'BLOCKUNITS',
    FULL: 'FULL',
} as const
export type ProductScope = (typeof ProductScope)[keyof typeof ProductScope]

export const ProductScopeSchema = z.enum([
    ProductScope.BROWSER,
    ProductScope.BLOCKUNITS,
    ProductScope.FULL,
])

/** Whether a product scope includes the browser agent (drives browserAgentEnabled + one-per-email). */
export function productScopeIncludesBrowserAgent(scope: ProductScope | null | undefined): boolean {
    return scope === ProductScope.BROWSER || scope === ProductScope.FULL
}
