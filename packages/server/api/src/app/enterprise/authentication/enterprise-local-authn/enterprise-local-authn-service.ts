// Clean-room implementation — local-account self-service flows (capability spec B.2).
// Two OTP-gated actions a user can perform on their own account without an active session:
// confirming ownership of their email address, and resetting a forgotten password. Both
// require a valid one-time code for the matching purpose; consuming the code is what
// authorizes the state change, and each action is recorded for audit.
import {
    IntellisperError,
    ApplicationEvent,
    ApplicationEventName,
    ErrorCode,
    isNil,
    OtpType,
    ResetPasswordRequestBody,
    UserId,
    UserIdentity,
    VerifyEmailRequestBody,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { userIdentityService } from '../../../authentication/user-identity/user-identity-service'
import { applicationEvents } from '../../../helper/application-events'
import { userService } from '../../../user/user-service'
import { otpService } from '../otp/otp-service'

export const enterpriseLocalAuthnService = (log: FastifyBaseLogger) => ({

    // Mark an identity's email as verified once the emailed code is confirmed.
    async verifyEmail({ identityId, otp }: VerifyEmailRequestBody): Promise<UserIdentity> {
        await assertOtpValid(log, identityId, OtpType.EMAIL_VERIFICATION, otp)
        await recordIdentityEvent(log, identityId, { action: ApplicationEventName.USER_EMAIL_VERIFIED, data: {} })
        return userIdentityService(log).verify(identityId)
    },

    // Set a new password on an identity once the reset code is confirmed.
    async resetPassword({ identityId, otp, newPassword }: ResetPasswordRequestBody): Promise<void> {
        await assertOtpValid(log, identityId, OtpType.PASSWORD_RESET, otp)
        await recordIdentityEvent(log, identityId, { action: ApplicationEventName.USER_PASSWORD_RESET, data: {} })
        await userIdentityService(log).updatePassword({ id: identityId, newPassword })
    },
})

// Confirm the presented code for the purpose, or reject with INVALID_OTP (a wrong,
// expired, or already-consumed code all surface the same way, so a caller cannot probe
// which case occurred).
async function assertOtpValid(log: FastifyBaseLogger, identityId: string, type: OtpType, value: string): Promise<void> {
    const confirmed = await otpService(log).confirm({ identityId, type, value })
    if (!confirmed) {
        throw new IntellisperError({ code: ErrorCode.INVALID_OTP, params: {} })
    }
}

// Emit an audit event for each platform-scoped user backing the identity (an identity may
// map to users across platforms; onboarding users with no platform are skipped).
async function recordIdentityEvent(log: FastifyBaseLogger, identityId: UserId, event: Pick<ApplicationEvent, 'action' | 'data'>): Promise<void> {
    const users = await userService(log).getUsersByIdentityId({ identityId })
    for (const { id, platformId } of users) {
        if (isNil(platformId)) {
            continue
        }
        applicationEvents(log).sendUserEvent({ platformId, userId: id }, event as ApplicationEvent)
    }
}
