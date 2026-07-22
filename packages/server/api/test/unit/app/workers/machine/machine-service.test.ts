import { ExecutionMode } from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../../../src/app/workers/machine/machine-cache', () => ({
    workerMachineCache: vi.fn(() => ({
        findOne: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue(undefined),
    })),
}))

vi.mock('../../../../../src/app/helper/system/system', () => ({
    // Mocked wholesale, so every accessor the import graph reaches must exist — a missing one is a
    // TypeError at module load. `getNumber` is read transitively (database/redis reads REDIS_DB at
    // module scope).
    system: {
        getOrThrow: vi.fn().mockReturnValue('test-value'),
        getNumberOrThrow: vi.fn().mockReturnValue(60),
        getNumber: vi.fn().mockReturnValue(undefined),
        getBoolean: vi.fn().mockReturnValue(false),
        // Literal, not the IbEdition enum: vi.mock's factory is hoisted above the imports, so an
        // enum reference here would not be initialized yet.
        getEdition: vi.fn().mockReturnValue('ce'),
        get: vi.fn().mockReturnValue(undefined),
    },
}))

vi.mock('../../../../../src/app/helper/domain-helper', () => ({
    domainHelper: {
        getPublicUrl: vi.fn().mockResolvedValue('https://example.com'),
    },
}))

import { system } from '../../../../../src/app/helper/system/system'

const mockLog = {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    child: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    silent: vi.fn(),
    level: 'info',
} as unknown as FastifyBaseLogger

const mockHealthcheck = {
    workerId: 'test-worker-1',
    cpuUsagePercentage: 10,
    ramUsagePercentage: 20,
    totalAvailableRamInBytes: 1024,
    diskInfo: {
        total: 1000,
        free: 500,
        used: 500,
        percentage: 50,
    },
}

describe('machineService — execution mode', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.resetModules()
    })

    it('should return system default execution mode for shared workers', async () => {
        vi.mocked(system.getOrThrow).mockReturnValue(ExecutionMode.SANDBOX_PROCESS)

        const { machineService: freshMachineService } = await import('../../../../../src/app/workers/machine/machine-service')
        const result = await freshMachineService(mockLog).onConnection(mockHealthcheck)

        expect(result.EXECUTION_MODE).toBe(ExecutionMode.SANDBOX_PROCESS)
    })

    it('should return system default execution mode for dedicated workers', async () => {
        vi.mocked(system.getOrThrow).mockReturnValue(ExecutionMode.SANDBOX_CODE_AND_PROCESS)

        const { machineService: freshMachineService } = await import('../../../../../src/app/workers/machine/machine-service')
        const result = await freshMachineService(mockLog).onConnection(mockHealthcheck, 'my-worker-group')

        expect(result.EXECUTION_MODE).toBe(ExecutionMode.SANDBOX_CODE_AND_PROCESS)
    })
})
