import { IntellisperError, ErrorCode } from '@intelblocks/shared'

export function isSandboxTimeout(e: unknown): boolean {
    return e instanceof IntellisperError && e.error.code === ErrorCode.SANDBOX_EXECUTION_TIMEOUT
}
