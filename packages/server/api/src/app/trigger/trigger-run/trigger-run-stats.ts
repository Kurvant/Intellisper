import { ibDayjs, ibDayjsDuration } from '@intelblocks/server-utils'
import { PlatformId, ProjectId, TriggerRunStatus, TriggerStatusReport } from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import Redis from 'ioredis'
import { redisHelper } from '../../database/redis'

export const triggerRunStats = (_log: FastifyBaseLogger, redisConnection: Redis) => ({
    async save({ platformId, blockName, status }: SaveParams): Promise<void> {
        const day = ibDayjs().format('YYYY-MM-DD')
        const statusToStore = status === TriggerRunStatus.COMPLETED ? status : TriggerRunStatus.FAILED
        const redisKey = triggerRunRedisKey(platformId, blockName, day, statusToStore)

        await redisConnection.incr(redisKey)
        await redisConnection.expire(redisKey, ibDayjsDuration(14, 'days').asSeconds())
    },

    async getStatusReport(params: GetStatusReportParams): Promise<TriggerStatusReport> {
        const { platformId } = params
        const redisKeys = await redisHelper.scanAll(redisConnection, triggerRunRedisKey(platformId, '*', '*', '*'))
        if (redisKeys.length === 0) {
            return { blocks: {} }
        }
        const values = await redisConnection.mget(redisKeys)
        const parsedRecords = parseRedisRecords(redisKeys, values)
        return aggregateRecords(parsedRecords)
    },
})

export const triggerRunRedisKey = (platformId: PlatformId, blockName: string, formattedDate: string, status: TriggerRunStatus | '*') => `trigger_run:${platformId}:${blockName}:${formattedDate}:${status}`

type ParsedRedisRecord = {
    blockName: string
    day: string
    status: TriggerRunStatus
    count: number
}

const parseRedisRecords = (redisKeys: string[], values: (string | null)[]): ParsedRedisRecord[] => {
    return redisKeys.map((key, index) => {
        const parts = key.split(':')
        return {
            blockName: parts[2],
            day: parts[3],
            status: parts[4] as TriggerRunStatus,
            count: Number(values[index]) || 0,
        }
    })
}

const aggregateRecords = (records: ParsedRedisRecord[]): TriggerStatusReport => {
    const blockNameToDayToStats = new Map<string, Map<string, { success: number, failure: number }>>()

    for (const record of records) {
        if (!blockNameToDayToStats.has(record.blockName)) {
            blockNameToDayToStats.set(record.blockName, new Map())
        }
        const dayMap = blockNameToDayToStats.get(record.blockName)!
        const dayKey = record.day
        if (!dayMap.has(dayKey)) {
            dayMap.set(dayKey, { success: 0, failure: 0 })
        }
        const dayStats = dayMap.get(dayKey)!
        if (record.status === TriggerRunStatus.COMPLETED) {
            dayStats.success += record.count
        }
        else {
            dayStats.failure += record.count
        }
    }
    const blocks: TriggerStatusReport['blocks'] = {}
    for (const [blockName, dayMap] of blockNameToDayToStats) {
        const dailyStats: Record<string, { success: number, failure: number }> = {}
        let totalRuns = 0
        for (const [day, stats] of dayMap) {
            dailyStats[day] = stats
            totalRuns += stats.success + stats.failure
        }
        blocks[blockName] = {
            dailyStats,
            totalRuns,
        }
    }

    return { blocks }
}

type GetStatusReportParams = {
    platformId: ProjectId
}

type SaveParams = {
    platformId: PlatformId
    blockName: string
    status: TriggerRunStatus
}