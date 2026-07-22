import { z } from 'zod'
import { ProductScopeSchema } from '../../../browser-agent/product-scope'
import { SAFE_STRING_PATTERN } from '../../common'
import { IbId } from '../../common/id-generator'
import { EmailType, PasswordType } from '../../user/user'

export const SignUpRequest = z.object({
    email: EmailType,
    password: PasswordType,
    firstName: z.string().regex(new RegExp(SAFE_STRING_PATTERN)),
    lastName: z.string().regex(new RegExp(SAFE_STRING_PATTERN)),
    trackEvents: z.boolean(),
    newsLetter: z.boolean(),
    // Intellisper: which product this sign-up is for (browser agent / blockunits / full). Optional
    // + backward-compatible — absent behaves as a stock blockunits sign-up. Threaded to platform
    // creation to set plan flags and (for browser/full) the one-platform-per-email rule.
    productScope: ProductScopeSchema.optional(),
})

export type SignUpRequest = z.infer<typeof SignUpRequest>

export const SwitchPlatformRequest = z.object({
    platformId: IbId,
})

export type SwitchPlatformRequest = z.infer<typeof SwitchPlatformRequest>
