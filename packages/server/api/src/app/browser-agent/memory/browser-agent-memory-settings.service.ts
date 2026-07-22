import { FastifyBaseLogger } from 'fastify'
import { databaseConnection } from '../../database/database-connection'
import { browserAgentTenancyService } from '../tenancy/browser-agent-tenancy.service'

/**
 * Per-user memory preferences — the switches a member controls over their OWN memory.
 *
 * Two different kinds of switch live here, and the distinction matters:
 *
 *  - autoRecall / autoCapture govern the user's own EXPERIENCE (does the agent use my memory, does
 *    it save what it learns). They default TRUE: memory that neither recalls nor captures is inert.
 *
 *  - adminVisibilityOptIn governs WHO ELSE CAN SEE their data, and defaults FALSE. It is one of the
 *    three conditions in the admin gate, and by itself it exposes NOTHING: it only permits facts the
 *    user has individually marked SHARED to become admin-visible, and only while the platform admin
 *    has also unlocked the capability. Facts left PRIVATE stay invisible regardless — turning this on
 *    can never widen access to them. Turning it off hides everything again on the next read, without
 *    touching the per-fact marks, so a later opt-in restores exactly the previous selection.
 *
 * The columns live on `user` next to the existing `agentSharingOptIn` and are deliberately kept off
 * the shared `User` model (the Phase-1 pattern) so blockunits' user contract stays untouched.
 */
export const browserAgentMemorySettings = (log: FastifyBaseLogger) => ({
    /**
     * The caller's settings. `adminVisibilityAvailable` reports whether the admin unlocked sharing
     * at all — the UI uses it to explain an inert switch instead of offering a dead control.
     * `sharedFactCount` tells the user exactly how many of their facts are in scope, so the opt-in
     * is never an abstract promise about unknown data.
     */
    async get(userId: string, platformId: string): Promise<MemorySettings> {
        const rows = await databaseConnection().query(
            `SELECT u."agentMemoryAutoRecall" AS "autoRecall",
                    u."agentMemoryAutoCapture" AS "autoCapture",
                    u."agentSharingOptIn" AS "adminVisibilityOptIn",
                    (SELECT COUNT(*)::int FROM browser_agent_memory_fact f
                      WHERE f."userId" = u.id AND f."platformId" = $2
                        AND f.scope = 'USER' AND f.visibility = 'SHARED' AND f."deletedAt" IS NULL) AS "sharedFactCount",
                    (SELECT COUNT(*)::int FROM "user" m WHERE m."platformId" = $2) AS "memberCount"
             FROM "user" u WHERE u.id = $1 AND u."platformId" = $2`,
            [userId, platformId],
        )
        const r = rows[0]
        const adminVisibilityAvailable = await browserAgentTenancyService(log).isSharingUnlocked(platformId)
        return {
            autoRecall: r?.autoRecall ?? true,
            autoCapture: r?.autoCapture ?? true,
            adminVisibilityOptIn: r?.adminVisibilityOptIn ?? false,
            adminVisibilityAvailable,
            sharedFactCount: r?.sharedFactCount ?? 0,
            // A solo signup is its own org, so the My/Org split is noise to them. This is a UI hint
            // ONLY — see MemorySettingsResponse.soloPlatform. Defaulting to false when the row is
            // missing keeps the richer (team) layout, which is never wrong, just more granular.
            soloPlatform: (r?.memberCount ?? 0) === 1,
        }
    },

    /**
     * Update the caller's own settings. Scoped to (id, platformId) so a user can only ever write
     * their own row — there is no admin-facing variant of this method by design: an admin must not
     * be able to opt a member in on their behalf. Undefined fields are left untouched.
     */
    async update(userId: string, platformId: string, params: { autoRecall?: boolean, autoCapture?: boolean, adminVisibilityOptIn?: boolean }): Promise<MemorySettings> {
        await databaseConnection().query(
            `UPDATE "user" SET
                "agentMemoryAutoRecall" = COALESCE($1, "agentMemoryAutoRecall"),
                "agentMemoryAutoCapture" = COALESCE($2, "agentMemoryAutoCapture"),
                "agentSharingOptIn" = COALESCE($3, "agentSharingOptIn"),
                updated = now()
             WHERE id = $4 AND "platformId" = $5`,
            [
                params.autoRecall ?? null,
                params.autoCapture ?? null,
                params.adminVisibilityOptIn ?? null,
                userId,
                platformId,
            ],
        )
        return this.get(userId, platformId)
    },

    /** Does this user want memory recalled into their turns? (runtime auto-inject check.) */
    async isAutoRecallEnabled(userId: string, platformId: string): Promise<boolean> {
        const rows = await databaseConnection().query(
            'SELECT "agentMemoryAutoRecall" AS v FROM "user" WHERE id = $1 AND "platformId" = $2',
            [userId, platformId],
        )
        return rows[0]?.v !== false
    },

    /** Does this user want the agent to save facts it learns? (auto-capture opt-out.) */
    async isAutoCaptureEnabled(userId: string, platformId: string): Promise<boolean> {
        const rows = await databaseConnection().query(
            'SELECT "agentMemoryAutoCapture" AS v FROM "user" WHERE id = $1 AND "platformId" = $2',
            [userId, platformId],
        )
        return rows[0]?.v !== false
    },
})

/**
 * Admin: flip the platform-wide capability that lets members opt in at all.
 *
 * This is the OUTERMOST condition of the gate and the only one an admin controls. Note what it
 * cannot do: unlocking does not share anything by itself — it merely lets members who choose to opt
 * in have their individually-SHARED facts become visible. Locking it back instantly hides every
 * shared fact platform-wide without destroying any member's marks or opt-in.
 */
export const browserAgentMemoryAdminSettings = {
    async setSharingUnlocked(platformId: string, unlocked: boolean): Promise<{ sharingUnlocked: boolean }> {
        await databaseConnection().query(
            'UPDATE "platform_plan" SET "agentSharingUnlocked" = $1, updated = now() WHERE "platformId" = $2',
            [unlocked, platformId],
        )
        return { sharingUnlocked: unlocked }
    },
}

/**
 * Declared once and shared by `get`/`update` — `update` returns `get`'s result, so duplicating the
 * shape is exactly how the two silently drifted apart before.
 */
type MemorySettings = {
    autoRecall: boolean
    autoCapture: boolean
    adminVisibilityOptIn: boolean
    adminVisibilityAvailable: boolean
    sharedFactCount: number
    soloPlatform: boolean
}
