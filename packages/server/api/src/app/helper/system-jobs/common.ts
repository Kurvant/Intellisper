import { Flow, FlowId, FlowRunId, PlatformId, ProjectId, UserId } from '@intelblocks/shared'
import { Job, JobsOptions } from 'bullmq'
import { Dayjs } from 'dayjs'

export enum SystemJobName {
    BLOCKS_ANALYTICS = 'blocks-analytics',
    BLOCKS_SYNC = 'blocks-sync',
    FILE_CLEANUP_TRIGGER = 'file-cleanup-trigger',
    TRIAL_TRACKER = 'trial-tracker',
    RUN_TELEMETRY = 'run-telemetry',
    DELETE_FLOW = 'delete-flow',
    AI_CREDIT_UPDATE_CHECK = 'ai-credit-update-check',
    HARD_DELETE_PROJECT = 'hard-delete-project',
    HARD_DELETE_PLATFORM = 'hard-delete-platform',
    RESUME_DELAY_WAITPOINT = 'resume-delay-waitpoint',
    FLOW_RUN_TRACKING = 'flow-run-tracking',
    LICENSE_KEY_EXPIRY_SWEEP = 'license-key-expiry-sweep',
    CHAT_METRICS_PRUNE = 'chat-metrics-prune',
    // Browser-agent automation (Phase 8): a repeated per-schedule cron firing, and a one-time
    // admission tick per batch row (offline/concurrency-gated kickoff onto the user's live session).
    BROWSER_AGENT_SCHEDULE_FIRE = 'browser-agent-schedule-fire',
    BROWSER_AGENT_BATCH_ROW = 'browser-agent-batch-row',
}

type DeleteFlowDurableSystemJobData =  {
    flow: Flow
    preDeleteDone: boolean
}

type AiCreditUpdateCheckSystemJobData = {
    apiKeyHash: string
    platformId: string
}

type HardDeleteProjectSystemJobData = {
    projectId: ProjectId
    platformId: PlatformId
    preDeletedFlowIds: FlowId[]
}

type HardDeletePlatformSystemJobData = {
    platformId: PlatformId
    userId: UserId
    identityId: string
}

type ResumeDelayWaitpointSystemJobData = {
    flowRunId: FlowRunId
    projectId: ProjectId
    waitpointId: string
}

type BrowserAgentScheduleFireSystemJobData = {
    scheduleId: string
}

type BrowserAgentBatchRowSystemJobData = {
    batchJobId: string
    routineRunId: string
    /** How many times this row's admission has been re-deferred (offline/busy) — bounds retries. */
    attempt?: number
}

type SystemJobDataMap = {
    [SystemJobName.BLOCKS_ANALYTICS]: Record<string, never>
    [SystemJobName.BLOCKS_SYNC]: Record<string, never>
    [SystemJobName.FILE_CLEANUP_TRIGGER]: Record<string, never>
    [SystemJobName.RUN_TELEMETRY]: Record<string, never>
    [SystemJobName.TRIAL_TRACKER]: Record<string, never>
    [SystemJobName.DELETE_FLOW]: DeleteFlowDurableSystemJobData
    [SystemJobName.AI_CREDIT_UPDATE_CHECK]: AiCreditUpdateCheckSystemJobData
    [SystemJobName.HARD_DELETE_PROJECT]: HardDeleteProjectSystemJobData
    [SystemJobName.HARD_DELETE_PLATFORM]: HardDeletePlatformSystemJobData
    [SystemJobName.RESUME_DELAY_WAITPOINT]: ResumeDelayWaitpointSystemJobData
    [SystemJobName.FLOW_RUN_TRACKING]: Record<string, never>
    [SystemJobName.LICENSE_KEY_EXPIRY_SWEEP]: Record<string, never>
    [SystemJobName.CHAT_METRICS_PRUNE]: Record<string, never>
    [SystemJobName.BROWSER_AGENT_SCHEDULE_FIRE]: BrowserAgentScheduleFireSystemJobData
    [SystemJobName.BROWSER_AGENT_BATCH_ROW]: BrowserAgentBatchRowSystemJobData
}

export type SystemJobData<T extends SystemJobName = SystemJobName> = T extends SystemJobName ? SystemJobDataMap[T] : never

export type SystemJobDefinition<T extends SystemJobName> = {
    name: T
    data: SystemJobData<T>
    jobId: string
}

export type SystemJobHandler<T extends SystemJobName = SystemJobName> = (data: SystemJobData<T>) => Promise<void>

type OneTimeJobSchedule = {
    type: 'one-time'
    date: Dayjs
}

type RepeatedJobSchedule = {
    type: 'repeated'
    cron: string
}

export type JobSchedule = OneTimeJobSchedule | RepeatedJobSchedule

type UpsertJobParams<T extends SystemJobName> = {
    job: SystemJobDefinition<T>
    schedule: JobSchedule
    customConfig?: JobsOptions
}

export type SystemJobSchedule = {
    init(): Promise<void>
    startWorker(): Promise<void>
    upsertJob<T extends SystemJobName>(params: UpsertJobParams<T>): Promise<void>
    getJob<T extends SystemJobName>(jobId: string): Promise<Job<SystemJobData<T>> | undefined>
    close(): Promise<void>
}
