// Clean-room implementation — one-time verification codes (capability spec B.2).
// Codes are single-use, short-lived, and purpose-bound. A fresh code is issued at most
// once per validity window per (identity, purpose) — a repeated request within the window
// is a no-op, which rate-limits issuance. Delivery is via the transactional email layer
// (A.1). The code is a high-entropy UUID (unguessable), and confirmation consumes it so it
// cannot be replayed.
import { randomUUID } from 'node:crypto'
import { ibId, isNil, OtpModel, OtpState, OtpType, PlatformId } from '@intelblocks/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { userIdentityService } from '../../../authentication/user-identity/user-identity-service'
import { repoFactory } from '../../../core/db/repo-factory'
import { emailService } from '../../helper/email/email-service'
import { OtpEntity } from './otp-entity'

const otpRepo = repoFactory(OtpEntity)

// How long an issued code remains valid.
const VALIDITY_MS = 10 * 60 * 1000

export const otpService = (log: FastifyBaseLogger) => ({

    // Issue and deliver a code for a purpose. Silent no-op if the email is unknown (so
    // the endpoint does not reveal which addresses exist) or if a still-valid code was
    // already issued for this (identity, purpose) — that window rate-limits issuance.
    async createAndSend({ platformId, email, type }: CreateParams): Promise<void> {
        const userIdentity = await userIdentityService(log).getIdentityByEmail(email)
        if (isNil(userIdentity)) {
            return
        }

        const existing = await otpRepo().findOneBy({ identityId: userIdentity.id, type })
        if (!isNil(existing) && isWithinWindow(existing.updated)) {
            return
        }

        const code = randomUUID()
        const record: Omit<OtpModel, 'created'> = {
            id: ibId(),
            updated: dayjs().toISOString(),
            type,
            identityId: userIdentity.id,
            value: code,
            state: OtpState.PENDING,
        }
        await otpRepo().upsert(record, ['identityId', 'type'])

        await emailService(log).sendOtp({ platformId, userIdentity, otp: code, type })
    },

    // Verify a presented code for a purpose. Succeeds only for a pending, unexpired code
    // whose value matches; on success the code is consumed (marked confirmed) so it cannot
    // be reused.
    async confirm({ identityId, type, value }: ConfirmParams): Promise<boolean> {
        const otp = await otpRepo().findOneBy({ identityId, type })
        if (isNil(otp)) {
            return false
        }
        const valid = otp.state === OtpState.PENDING
            && isWithinWindow(otp.updated)
            && otp.value === value
        if (valid) {
            await otpRepo().update(otp.id, { state: OtpState.CONFIRMED })
        }
        return valid
    },
})

function isWithinWindow(updated: string): boolean {
    return dayjs().diff(dayjs(updated), 'milliseconds') < VALIDITY_MS
}

type CreateParams = {
    platformId: PlatformId | null
    email: string
    type: OtpType
}

type ConfirmParams = {
    identityId: string
    type: OtpType
    value: string
}
