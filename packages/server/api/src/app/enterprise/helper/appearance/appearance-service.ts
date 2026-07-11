// Clean-room implementation — white-label theme resolution (capability spec D.2). A single
// resolver returns the EFFECTIVE theme to apply for an organization (or none): its display
// name, full/icon logos, favicon, and primary color composed into a theme, with any missing
// input — or a null organization context — falling back to the platform default.
//
// Edition/entitlement rules (D.2):
//   - COMMUNITY  → always the default theme;
//   - CLOUD      → always the organization's branding;
//   - ENTERPRISE → the organization's branding ONLY when the custom-appearance entitlement is
//                  enabled, otherwise the default theme.
//
// Fail-safe: a null/absent organization context (or any resolution error) resolves to the
// default theme — never an error or empty result (I.3 fail-safe). The resolved theme is
// surfaced to the UI through the feature-flag channel and applied to outbound messages (A.1).
import { IbEdition, isNil, PlatformId } from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { defaultTheme, generateTheme } from '../../../flags/theme'
import { system } from '../../../helper/system/system'
import { platformService } from '../../../platform/platform.service'

type Theme = ReturnType<typeof generateTheme>

export const appearanceService = (log: FastifyBaseLogger) => ({
    // Resolve the effective theme for an organization reference (or none).
    async getThemeForPlatform(platformId: PlatformId | null | undefined): Promise<Theme> {
        if (isNil(platformId)) {
            return defaultTheme
        }
        const edition = system.getEdition()
        // Community is never entitled to custom appearance; short-circuit to the default.
        if (edition === IbEdition.COMMUNITY) {
            return defaultTheme
        }
        try {
            const platform = await platformService(log).getOneWithPlanOrThrow(platformId)
            // Enterprise only themes when the custom-appearance entitlement is on; cloud always
            // themes with the organization's branding.
            const brandingAllowed = edition === IbEdition.CLOUD || platform.plan.customAppearanceEnabled === true
            if (!brandingAllowed) {
                return defaultTheme
            }
            return generateTheme({
                websiteName: fallback(platform.name, defaultTheme.websiteName),
                primaryColor: fallback(platform.primaryColor, '#6e41e2'),
                fullLogoUrl: fallback(platform.fullLogoUrl, defaultTheme.logos.fullLogoUrl),
                favIconUrl: fallback(platform.favIconUrl, defaultTheme.logos.favIconUrl),
                logoIconUrl: fallback(platform.logoIconUrl, defaultTheme.logos.logoIconUrl),
            })
        }
        catch (error) {
            // Fail-safe: any failure to resolve branding degrades to the default theme.
            log.warn({ error, platformId }, '[appearanceService] failed to resolve platform theme; using default')
            return defaultTheme
        }
    },
})

function fallback(value: string | null | undefined, defaultValue: string): string {
    return !isNil(value) && value.trim() !== '' ? value : defaultValue
}
