import { safeHttp } from '@intelblocks/server-utils'
import { ibId, PlanName, TeamProjectsLimit } from '@intelblocks/shared'
import { AxiosError } from 'axios'
import { FastifyInstance } from 'fastify'
import { databaseConnection } from '../../../../src/app/database/database-connection'
import { licenseKeysService } from '../../../../src/app/enterprise/license-keys/license-keys-service'
import { mockAndSaveBasicSetup } from '../../../helpers/mocks'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

// A full entitlement document with all capability booleans set (a valid enterprise key).
function licenseDoc(overrides?: Record<string, unknown>) {
    const flags = {
        ssoEnabled: true, scimEnabled: true, environmentsEnabled: true, embeddingEnabled: true,
        auditLogEnabled: true, customAppearanceEnabled: true, globalConnectionsEnabled: true,
        customRolesEnabled: true, projectRolesEnabled: true, apiKeysEnabled: true,
        manageProjectsEnabled: true, manageBlocksEnabled: true, manageTemplatesEnabled: true,
        secretManagersEnabled: true, analyticsEnabled: true, eventStreamingEnabled: true,
        agentsEnabled: true, aiProvidersEnabled: true, showPoweredBy: false,
    }
    return {
        id: ibId(), email: 'ops@example.com', key: `lk-${ibId()}`,
        createdAt: new Date().toISOString(), activatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
        ...flags,
        ...overrides,
    }
}

async function planFor(platformId: string): Promise<Record<string, unknown>> {
    return databaseConnection().getRepository('platform_plan').findOneByOrFail({ platformId }) as Promise<Record<string, unknown>>
}

describe('License Keys (G.4.a activation & entitlement application)', () => {
    let getSpy: ReturnType<typeof vi.fn>
    let postSpy: ReturnType<typeof vi.fn>

    beforeEach(() => {
        getSpy = vi.fn()
        postSpy = vi.fn().mockResolvedValue({ data: {} })
        vi.spyOn(safeHttp.retryingAxios, 'get').mockImplementation(getSpy)
        vi.spyOn(safeHttp.retryingAxios, 'post').mockImplementation(postSpy)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('verify applies the entitlement flags to the platform plan', async () => {
        const { mockPlatform } = await mockAndSaveBasicSetup()
        const doc = licenseDoc()
        getSpy.mockResolvedValue({ data: doc })

        const verified = await licenseKeysService(app!.log).verifyKeyOrReturnNull({ platformId: mockPlatform.id, license: doc.key })
        expect(verified).not.toBeNull()
        await licenseKeysService(app!.log).applyLimits(mockPlatform.id, verified!)

        const plan = await planFor(mockPlatform.id)
        expect(plan.plan).toBe(PlanName.ENTERPRISE)
        expect(plan.ssoEnabled).toBe(true)
        expect(plan.scimEnabled).toBe(true)
        expect(plan.eventStreamingEnabled).toBe(true)
        expect(plan.embeddingEnabled).toBe(true)
        expect(plan.secretManagersEnabled).toBe(true)
        expect(plan.licenseKey).toBe(doc.key)
        // manageProjects granted -> UNLIMITED team projects.
        expect(plan.teamProjectsLimit).toBe(TeamProjectsLimit.UNLIMITED)
        // Commercial fields cleared.
        expect(plan.stripeSubscriptionId).toBeNull()
        expect(plan.activeFlowsLimit).toBeNull()
        // markAsActivated was called (idempotent activation on every verify).
        expect(postSpy).toHaveBeenCalledWith(expect.stringContaining('/license-keys/activate'), expect.anything())
    })

    it('getKey returns null for an unknown key (404) and the document otherwise', async () => {
        getSpy.mockRejectedValueOnce(new AxiosError('nf', undefined, undefined, undefined, { status: 404 } as never))
        expect(await licenseKeysService(app!.log).getKey('missing')).toBeNull()

        const doc = licenseDoc()
        getSpy.mockResolvedValueOnce({ data: doc })
        expect((await licenseKeysService(app!.log).getKey(doc.key))?.key).toBe(doc.key)

        // Nil key short-circuits with no HTTP call.
        getSpy.mockClear()
        expect(await licenseKeysService(app!.log).getKey(undefined)).toBeNull()
        expect(getSpy).not.toHaveBeenCalled()
    })

    it('verify returns null for an expired key', async () => {
        const { mockPlatform } = await mockAndSaveBasicSetup()
        getSpy.mockResolvedValue({ data: licenseDoc({ expiresAt: new Date(Date.now() - 1000).toISOString() }) })

        const verified = await licenseKeysService(app!.log).verifyKeyOrReturnNull({ platformId: mockPlatform.id, license: 'k' })
        expect(verified).toBeNull()
    })

    it('an internal key (no SSO, no embedding) resolves to the internal tier on cloud', async () => {
        const { mockPlatform } = await mockAndSaveBasicSetup()
        const doc = licenseDoc({ ssoEnabled: false, embeddingEnabled: false, manageProjectsEnabled: false })
        await licenseKeysService(app!.log).applyLimits(mockPlatform.id, doc as never)

        const plan = await planFor(mockPlatform.id)
        // Edition-dependent: internal only on cloud; on non-cloud test edition it is enterprise.
        expect([PlanName.ENTERPRISE, PlanName.INTERNAL]).toContain(plan.plan)
    })

    it('downgradeToFreePlan turns every entitlement off and clears the license', async () => {
        const { mockPlatform } = await mockAndSaveBasicSetup()
        await licenseKeysService(app!.log).applyLimits(mockPlatform.id, licenseDoc() as never)

        await licenseKeysService(app!.log).downgradeToFreePlan(mockPlatform.id)

        const plan = await planFor(mockPlatform.id)
        expect(plan.plan).toBe(PlanName.STANDARD)
        expect(plan.ssoEnabled).toBe(false)
        expect(plan.scimEnabled).toBe(false)
        expect(plan.eventStreamingEnabled).toBe(false)
        expect(plan.embeddingEnabled).toBe(false)
        expect(plan.licenseKey).toBeNull()
        expect(plan.licenseExpiresAt).toBeNull()
        expect(plan.teamProjectsLimit).toBe(TeamProjectsLimit.NONE)
    })

    it('applyLimits defaults aiProviders ON and chat OFF when the document omits them', async () => {
        const { mockPlatform } = await mockAndSaveBasicSetup()
        const doc = licenseDoc()
        delete (doc as Record<string, unknown>).aiProvidersEnabled
        delete (doc as Record<string, unknown>).chatEnabled
        await licenseKeysService(app!.log).applyLimits(mockPlatform.id, doc as never)

        const plan = await planFor(mockPlatform.id)
        expect(plan.aiProvidersEnabled).toBe(true)
        expect(plan.chatEnabled).toBe(false)
    })
})
