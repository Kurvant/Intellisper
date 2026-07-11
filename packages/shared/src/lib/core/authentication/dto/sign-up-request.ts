import { z } from 'zod'
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
})

export type SignUpRequest = z.infer<typeof SignUpRequest>

export const SwitchPlatformRequest = z.object({
    platformId: IbId,
})

export type SwitchPlatformRequest = z.infer<typeof SwitchPlatformRequest>
