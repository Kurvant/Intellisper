import { ibDayjs } from '@intelblocks/server-utils'
import {
    FlowStatus,
    ProjectType,
    RunEnvironment,
} from '@intelblocks/shared'
import { FastifyInstance } from 'fastify'
import { databaseConnection } from '../../../../src/app/database/database-connection'
import { flowRunTrackingService } from '../../../../src/app/enterprise/flow-run-tracking/flow-run-tracking-service'
import { db } from '../../../helpers/db'
import {
    createMockFlow,
    createMockFlowRun,
    createMockFlowVersion,
    createMockProject,
    createMockUser,
    mockAndSaveBasicSetup,
} from '../../../helpers/mocks'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

// A timestamp inside the previous completed UTC day (the reporting window).
const yesterdayNoonUtc = (): string => ibDayjs().utc().startOf('day').subtract(1, 'day').add(12, 'hours').toISOString()
// A timestamp inside today's UTC day (outside the window).
const todayNoonUtc = (): string => ibDayjs().utc().startOf('day').add(12, 'hours').toISOString()

type ReportPayload = {
    platform_id: string
    active_flows: number
    projects: number
    users: number
    daily_executions: { date: string, count: number }[]
    reported_at: string
}

async function reportFor(platformId: string): Promise<{ distinctId: string, payload: ReportPayload } | undefined> {
    const reports = await flowRunTrackingService(app!.log).collectReports()
    const match = reports.find((r) => (r.payload as unknown as ReportPayload).platform_id === platformId)
    return match ? { distinctId: match.distinctId, payload: match.payload as unknown as ReportPayload } : undefined
}

describe('Flow Run Tracking (G.4.b usage metering)', () => {
    it('reports a licensed platform snapshot with the correct metric counts', async () => {
        const { mockPlatform, mockProject } = await mockAndSaveBasicSetup({
            plan: { licenseKey: `lic-${Date.now()}` },
        })
        // A TEAM project + an extra member + flows + runs in/out of the window.
        const teamProject = createMockProject({ platformId: mockPlatform.id, ownerId: mockPlatform.ownerId, type: ProjectType.TEAM })
        await db.save('project', teamProject)
        const member = createMockUser({ platformId: mockPlatform.id })
        await databaseConnection().getRepository('user_identity').save({
            id: member.identityId, created: new Date().toISOString(), updated: new Date().toISOString(),
            email: `m-${member.id}@e.com`, password: 'x', firstName: 'M', lastName: 'U',
            trackEvents: true, newsLetter: false, provider: 'EMAIL', verified: true, tokenVersion: 'v',
        })
        await db.save('user', member)

        const enabledFlow = createMockFlow({ projectId: mockProject.id, status: FlowStatus.ENABLED })
        const disabledFlow = createMockFlow({ projectId: mockProject.id, status: FlowStatus.DISABLED })
        await db.save('flow', [enabledFlow, disabledFlow])
        const flowVersion = createMockFlowVersion({ flowId: enabledFlow.id })
        await databaseConnection().getRepository('flow_version').save(flowVersion)

        const runFields = { projectId: mockProject.id, flowId: enabledFlow.id, flowVersionId: flowVersion.id }
        const runInWindow = createMockFlowRun({ ...runFields, environment: RunEnvironment.PRODUCTION, created: yesterdayNoonUtc() })
        const runOutsideWindow = createMockFlowRun({ ...runFields, environment: RunEnvironment.PRODUCTION, created: todayNoonUtc() })
        const testRun = createMockFlowRun({ ...runFields, environment: RunEnvironment.TESTING, created: yesterdayNoonUtc() })
        await db.save('flow_run', [runInWindow, runOutsideWindow, testRun])

        const report = await reportFor(mockPlatform.id)
        expect(report).toBeDefined()
        // Keyed by the platform's license key.
        const plan = await databaseConnection().getRepository('platform_plan').findOneByOrFail({ platformId: mockPlatform.id }) as { licenseKey: string }
        expect(report!.distinctId).toBe(plan.licenseKey)

        const payload = report!.payload
        expect(payload.platform_id).toBe(mockPlatform.id)
        // Exactly 1 ENABLED flow exists for this fresh platform; the DISABLED one is excluded.
        expect(payload.active_flows).toBe(1)
        // owner + member = at least 2 users.
        expect(payload.users).toBeGreaterThanOrEqual(2)
        // Both the basic-setup project and the extra one are TEAM (createMockProject defaults to
        // TEAM); the count reflects non-deleted TEAM workspaces.
        expect(payload.projects).toBe(2)
        // Only the production run inside yesterday's window counts (out-of-window + test excluded).
        expect(payload.daily_executions).toHaveLength(1)
        expect(payload.daily_executions[0].count).toBe(1)
        expect(payload.daily_executions[0].date).toBe(ibDayjs().utc().startOf('day').subtract(1, 'day').format('YYYY-MM-DD'))
        expect(payload.reported_at).toBeDefined()
    })

    it('does not report an unlicensed platform', async () => {
        const { mockPlatform } = await mockAndSaveBasicSetup()
        // createMockPlatformPlan coalesces a null licenseKey to a faker word, so null the column
        // explicitly to model an unlicensed organization.
        await databaseConnection().getRepository('platform_plan').update({ platformId: mockPlatform.id }, { licenseKey: null })

        const report = await reportFor(mockPlatform.id)
        expect(report).toBeUndefined()
    })

    it('returns an empty report set when there are no licensed platforms', async () => {
        // Null out every plan's license key so the map is empty.
        await databaseConnection().getRepository('platform_plan').createQueryBuilder().update().set({ licenseKey: null }).execute()

        const reports = await flowRunTrackingService(app!.log).collectReports()
        expect(reports).toHaveLength(0)
    })

    it('shares one reported_at timestamp across every organization event in a run', async () => {
        await databaseConnection().getRepository('platform_plan').createQueryBuilder().update().set({ licenseKey: null }).execute()
        const a = await mockAndSaveBasicSetup({ plan: { licenseKey: `lic-a-${Date.now()}` } })
        const b = await mockAndSaveBasicSetup({ plan: { licenseKey: `lic-b-${Date.now()}` } })

        const reports = await flowRunTrackingService(app!.log).collectReports()
        const reportA = reports.find((r) => (r.payload as unknown as ReportPayload).platform_id === a.mockPlatform.id)
        const reportB = reports.find((r) => (r.payload as unknown as ReportPayload).platform_id === b.mockPlatform.id)
        expect(reportA).toBeDefined()
        expect(reportB).toBeDefined()
        expect((reportA!.payload as unknown as ReportPayload).reported_at).toBe((reportB!.payload as unknown as ReportPayload).reported_at)
    })

    it('reportAllPlatforms is best-effort and never throws', async () => {
        await mockAndSaveBasicSetup({ plan: { licenseKey: `lic-${Date.now()}` } })
        await expect(flowRunTrackingService(app!.log).reportAllPlatforms()).resolves.toBeUndefined()
    })
})
