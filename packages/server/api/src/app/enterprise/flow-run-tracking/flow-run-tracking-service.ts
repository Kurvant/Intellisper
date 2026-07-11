// Clean-room implementation — licensed self-hosted usage metering & reporting (capability spec
// G.4.b). A scheduled daily system job (`flow-run-tracking`) that reports each licensed
// organization's usage snapshot back to the vendor's usage sink, keyed by the organization's
// license key.
//
// Architecture (G.4.b):
//  - init() registers the job HANDLER and upserts a REPEATED daily-cron schedule under a stable job
//    id (idempotent — one schedule survives restarts). Registration is UNCONDITIONAL across every
//    edition; the gate is INSIDE the routine (license-key presence), not the registration.
//  - The routine loads {platform → licenseKey} for platforms whose plan carries a non-null license
//    key; an empty map returns immediately. Only mapped organizations are reported; the license key
//    is both the gate and the report distinct-id. This is billing/meter data (not product
//    telemetry) so it is independent of the telemetry opt-in flag.
//  - For each licensed organization it captures ONE fire-and-forget event with the stable payload
//    { platform_id, active_flows, projects, users, daily_executions: [{date,count}], reported_at }.
//    `reported_at` is stamped ONCE per run and shared by every organization's event.
//
// Metric definitions (all exclude soft-deleted workspaces):
//  - active_flows — ENABLED automations in non-deleted workspaces, per organization.
//  - users        — all users of the organization.
//  - projects     — non-deleted TEAM workspaces of the organization.
//  - daily_executions — PRODUCTION runs grouped by workspace + UTC calendar day, rolled up per
//    organization. Only production runs count.
//
// Day window: the half-open UTC interval [start-of-yesterday, start-of-today). It covers only the
// previous COMPLETED UTC day, so a day's figure is final on first send and re-running the same day
// re-emits the same value (idempotent per day). There is NO backfill — a missed day is not
// recovered.
//
// Query & connection discipline (must be honored): the three count aggregates run SEQUENTIALLY (at
// most one shared-pool connection at a time); the execution counts fetch licensed workspace ids
// first and run the run-count aggregate scoped by `projectId IN (...)` (index-usable, no org join /
// no time-only scan), CHUNKED into fixed batches with a fixed throttle delay before each batch, and
// rolled up per organization IN MEMORY. The whole routine is best-effort/failure-isolated: any
// error is caught, logged, and never propagated.
import { ibDayjs } from '@intelblocks/server-utils'
import { FlowStatus, isNil, ProjectType, RunEnvironment } from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { repoFactory } from '../../core/db/repo-factory'
import { FlowEntity } from '../../flows/flow/flow.entity'
import { FlowRunEntity } from '../../flows/flow-run/flow-run-entity'
import { SystemJobName } from '../../helper/system-jobs/common'
import { systemJobHandlers } from '../../helper/system-jobs/job-handlers'
import { systemJobsSchedule } from '../../helper/system-jobs/system-job'
import { ProjectEntity } from '../../project/project-entity'
import { UserEntity } from '../../user/user-entity'
import { PlatformPlanEntity } from '../platform/platform-plan/platform-plan.entity'
import { USAGE_REPORT_EVENT_NAME, UsageReportEvent, usageReportSink } from './usage-report-sink'

const platformPlanRepo = repoFactory(PlatformPlanEntity)
const flowRepo = repoFactory(FlowEntity)
const userRepo = repoFactory(UserEntity)
const projectRepo = repoFactory(ProjectEntity)
const flowRunRepo = repoFactory(FlowRunEntity)

// Report once per UTC day; keep each run-count aggregate bounded.
const REPORT_CRON = '0 3 * * *'
const WORKSPACE_ID_BATCH_SIZE = 200
const BATCH_THROTTLE_MS = 250

type CountRow = { platformId: string, count: string }

export const flowRunTrackingService = (log: FastifyBaseLogger) => ({
    // Register the job handler and upsert the daily schedule. Unconditional across editions; the
    // license-key gate lives inside the routine.
    async init(): Promise<void> {
        systemJobHandlers.registerJobHandler(SystemJobName.FLOW_RUN_TRACKING, async () => {
            await flowRunTrackingService(log).reportAllPlatforms()
        })
        await systemJobsSchedule(log).upsertJob({
            job: {
                name: SystemJobName.FLOW_RUN_TRACKING,
                data: {},
                jobId: SystemJobName.FLOW_RUN_TRACKING,
            },
            schedule: {
                type: 'repeated',
                cron: REPORT_CRON,
            },
        })
    },

    // The report-all routine. Best-effort: any error is logged and swallowed so a failed report
    // never crashes the scheduler. Collects the per-organization snapshots then captures each to
    // the usage sink.
    async reportAllPlatforms(): Promise<void> {
        try {
            const reports = await flowRunTrackingService(log).collectReports()
            const sink = usageReportSink(log)
            for (const report of reports) {
                sink.capture(report)
            }
        }
        catch (error) {
            log.error({ error }, '[flowRunTrackingService] usage report run failed')
        }
    },

    // Build the per-organization usage-report events for the previous UTC day (pure aggregation, no
    // delivery). Returns an empty array when no organization is licensed. Exposed so the collection
    // logic is verifiable independently of the delivery sink.
    async collectReports(): Promise<UsageReportEvent[]> {
        const licenseKeyByPlatform = await loadLicensedPlatforms()
        if (licenseKeyByPlatform.size === 0) {
            return []
        }
        const platformIds = [...licenseKeyByPlatform.keys()]

        // Half-open UTC window over the previous completed day: [yesterday 00:00, today 00:00).
        const windowStart = ibDayjs().utc().startOf('day').subtract(1, 'day')
        const windowEnd = windowStart.add(1, 'day')
        const dayLabel = windowStart.format('YYYY-MM-DD')
        const reportedAt = ibDayjs().utc().toISOString()

        // Three count aggregates, SEQUENTIALLY (one pooled connection at a time).
        const activeFlowsByPlatform = await countActiveFlows(platformIds)
        const usersByPlatform = await countUsers(platformIds)
        const teamProjectsByPlatform = await countTeamProjects(platformIds)

        // Executions: resolve licensed workspace ids, then a workspace-scoped, chunked, throttled
        // run-count aggregate, rolled up per platform in memory.
        const projectToPlatform = await loadWorkspaceOwnership(platformIds)
        const dailyExecutionsByPlatform = await countDailyExecutions({
            projectToPlatform,
            windowStart: windowStart.toISOString(),
            windowEnd: windowEnd.toISOString(),
            log,
        })

        return platformIds.map((platformId) => ({
            distinctId: licenseKeyByPlatform.get(platformId)!,
            event: USAGE_REPORT_EVENT_NAME,
            payload: {
                platform_id: platformId,
                active_flows: activeFlowsByPlatform.get(platformId) ?? 0,
                projects: teamProjectsByPlatform.get(platformId) ?? 0,
                users: usersByPlatform.get(platformId) ?? 0,
                daily_executions: [{ date: dayLabel, count: dailyExecutionsByPlatform.get(platformId) ?? 0 }],
                reported_at: reportedAt,
            },
        }))
    },
})

// {platform → licenseKey} for every platform whose plan carries a non-null license key.
async function loadLicensedPlatforms(): Promise<Map<string, string>> {
    const rows = await platformPlanRepo()
        .createQueryBuilder('plan')
        .select(['plan.platformId AS "platformId"', 'plan.licenseKey AS "licenseKey"'])
        .where('plan.licenseKey IS NOT NULL')
        .getRawMany<{ platformId: string, licenseKey: string }>()
    const map = new Map<string, string>()
    for (const row of rows) {
        if (!isNil(row.licenseKey) && row.licenseKey.trim() !== '') {
            map.set(row.platformId, row.licenseKey)
        }
    }
    return map
}

// ENABLED automations in non-deleted workspaces, grouped by owning organization.
async function countActiveFlows(platformIds: string[]): Promise<Map<string, number>> {
    const rows = await flowRepo()
        .createQueryBuilder('flow')
        .innerJoin('flow.project', 'project')
        .select('project."platformId"', 'platformId')
        .addSelect('COUNT(flow.id)', 'count')
        .where('project."platformId" IN (:...platformIds)', { platformIds })
        .andWhere('project.deleted IS NULL')
        .andWhere('flow.status = :status', { status: FlowStatus.ENABLED })
        .groupBy('project."platformId"')
        .getRawMany<CountRow>()
    return toCountMap(rows)
}

// All users belonging to the organization. `app_user` alias — `user` is a reserved SQL keyword.
async function countUsers(platformIds: string[]): Promise<Map<string, number>> {
    const rows = await userRepo()
        .createQueryBuilder('app_user')
        .select('app_user."platformId"', 'platformId')
        .addSelect('COUNT(app_user.id)', 'count')
        .where('app_user."platformId" IN (:...platformIds)', { platformIds })
        .groupBy('app_user."platformId"')
        .getRawMany<CountRow>()
    return toCountMap(rows)
}

// Non-deleted TEAM workspaces of the organization.
async function countTeamProjects(platformIds: string[]): Promise<Map<string, number>> {
    const rows = await projectRepo()
        .createQueryBuilder('project')
        .select('project."platformId"', 'platformId')
        .addSelect('COUNT(project.id)', 'count')
        .where('project."platformId" IN (:...platformIds)', { platformIds })
        .andWhere('project.type = :type', { type: ProjectType.TEAM })
        .andWhere('project.deleted IS NULL')
        .groupBy('project."platformId"')
        .getRawMany<CountRow>()
    return toCountMap(rows)
}

// The licensed organizations' non-deleted workspace ids, mapped to their owning organization.
async function loadWorkspaceOwnership(platformIds: string[]): Promise<Map<string, string>> {
    const rows = await projectRepo()
        .createQueryBuilder('project')
        .select(['project.id AS "id"', 'project."platformId" AS "platformId"'])
        .where('project."platformId" IN (:...platformIds)', { platformIds })
        .andWhere('project.deleted IS NULL')
        .getRawMany<{ id: string, platformId: string }>()
    const map = new Map<string, string>()
    for (const row of rows) {
        map.set(row.id, row.platformId)
    }
    return map
}

// PRODUCTION run counts for the window, scoped by workspace id (chunked + throttled), rolled up
// per organization in memory.
async function countDailyExecutions({ projectToPlatform, windowStart, windowEnd, log }: {
    projectToPlatform: Map<string, string>
    windowStart: string
    windowEnd: string
    log: FastifyBaseLogger
}): Promise<Map<string, number>> {
    const runsByPlatform = new Map<string, number>()
    const projectIds = [...projectToPlatform.keys()]
    for (const batch of chunk(projectIds, WORKSPACE_ID_BATCH_SIZE)) {
        await delay(BATCH_THROTTLE_MS)
        const rows = await flowRunRepo()
            .createQueryBuilder('flow_run')
            .select('flow_run."projectId"', 'projectId')
            .addSelect('COUNT(flow_run.id)', 'count')
            .where('flow_run."projectId" IN (:...projectIds)', { projectIds: batch })
            .andWhere('flow_run.environment = :environment', { environment: RunEnvironment.PRODUCTION })
            .andWhere('flow_run.created >= :windowStart', { windowStart })
            .andWhere('flow_run.created < :windowEnd', { windowEnd })
            .groupBy('flow_run."projectId"')
            .getRawMany<{ projectId: string, count: string }>()
        for (const row of rows) {
            const platformId = projectToPlatform.get(row.projectId)
            if (isNil(platformId)) {
                continue
            }
            runsByPlatform.set(platformId, (runsByPlatform.get(platformId) ?? 0) + Number(row.count))
        }
    }
    if (projectIds.length === 0) {
        log.debug('[flowRunTrackingService] no licensed workspaces; skipping execution aggregate')
    }
    return runsByPlatform
}

function toCountMap(rows: CountRow[]): Map<string, number> {
    const map = new Map<string, number>()
    for (const row of rows) {
        map.set(row.platformId, Number(row.count))
    }
    return map
}

function chunk<T>(items: T[], size: number): T[][] {
    const batches: T[][] = []
    for (let index = 0; index < items.length; index += size) {
        batches.push(items.slice(index, index + size))
    }
    return batches
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}
