import { environmentMigrations } from '@intelblocks/server-utils'
import { from } from 'env-var'

function env() {
    return from(environmentMigrations.migrate())
}

function getApiUrl(): string {
    const containerType = system.get(WorkerSystemProp.CONTAINER_TYPE) ?? 'WORKER_AND_APP'
    if (containerType === 'WORKER_AND_APP') {
        const port = process.env[WorkerSystemProp.PORT] ?? system.get(WorkerSystemProp.PORT)
        return `http://127.0.0.1:${port}/api/`
    }
    const frontendUrl = system.getOrThrow(WorkerSystemProp.FRONTEND_URL).replace(/\/+$/, '')
    return frontendUrl + '/api/'
}

function getSocketUrl(): { url: string, path: string } {
    const containerType = system.get(WorkerSystemProp.CONTAINER_TYPE) ?? 'WORKER_AND_APP'
    if (containerType === 'WORKER_AND_APP') {
        const port = process.env[WorkerSystemProp.PORT] ?? system.get(WorkerSystemProp.PORT)
        return { url: `http://127.0.0.1:${port}`, path: '/api/socket.io' }
    }
    const frontendUrl = system.getOrThrow(WorkerSystemProp.FRONTEND_URL).replace(/\/+$/, '')
    return { url: frontendUrl, path: '/api/socket.io' }
}

export enum WorkerSystemProp {
    FRONTEND_URL = 'IB_FRONTEND_URL',
    CONTAINER_TYPE = 'IB_CONTAINER_TYPE',
    WORKER_TOKEN = 'IB_WORKER_TOKEN',
    PORT = 'IB_PORT',
    LOG_LEVEL = 'IB_LOG_LEVEL',
    LOG_PRETTY = 'IB_LOG_PRETTY',
    OTEL_ENABLED = 'IB_OTEL_ENABLED',
    LOAD_TRANSLATIONS_FOR_DEV_BLOCKS = 'IB_LOAD_TRANSLATIONS_FOR_DEV_BLOCKS',
    WORKER_GROUP_ID = 'IB_WORKER_GROUP_ID',
    WORKER_CONCURRENCY = 'IB_WORKER_CONCURRENCY',
    EXECUTION_MODE = 'IB_EXECUTION_MODE',
    REUSE_SANDBOX = 'IB_REUSE_SANDBOX',
}

const defaultValues: Partial<Record<WorkerSystemProp, string>> = {
    [WorkerSystemProp.PORT]: '3000',
    [WorkerSystemProp.LOG_LEVEL]: 'info',
    [WorkerSystemProp.LOG_PRETTY]: 'false',
    [WorkerSystemProp.OTEL_ENABLED]: 'false',
    [WorkerSystemProp.WORKER_CONCURRENCY]: '5',
}

export const system = {
    get(prop: WorkerSystemProp): string | undefined {
        return env().get(prop).asString() ?? defaultValues[prop]
    },
    getOrThrow(prop: WorkerSystemProp): string {
        return env().get(prop).required().asString()
    },
    getBoolean(prop: WorkerSystemProp): boolean | undefined {
        return env().get(prop).asBoolStrict()
    },
    getList(prop: WorkerSystemProp): string[] {
        const value = env().get(prop).asString() ?? defaultValues[prop]
        return value ? value.split(',').map(s => s.trim()).filter(Boolean) : []
    },
}

export { getApiUrl, getSocketUrl }
