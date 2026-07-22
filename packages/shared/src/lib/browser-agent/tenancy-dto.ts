import { z } from 'zod'

/**
 * Request to resolve an invite collision where the acting user already owns a personal
 * browser-agent workspace. See browserAgentTenancyService.resolvePersonalPlatformCollision.
 */
export const ResolvePersonalPlatformCollisionRequest = z.object({
    action: z.enum(['transfer', 'abandon', 'decline']),
    /** Required when action = 'transfer': the team platform to move the browser-agent data into. */
    targetPlatformId: z.string().optional(),
})
export type ResolvePersonalPlatformCollisionRequest = z.infer<
    typeof ResolvePersonalPlatformCollisionRequest
>

export const ResolvePersonalPlatformCollisionResponse = z.object({
    action: z.string(),
    moved: z.number(),
})
export type ResolvePersonalPlatformCollisionResponse = z.infer<
    typeof ResolvePersonalPlatformCollisionResponse
>
