import { FilesService } from '@intelblocks/blocks-framework'
import { ibId, FileSizeError, FileType } from '@intelblocks/shared'
import { engineFileApi } from '../engine-file-api'

export function createFileUploader({ engineToken, apiUrl }: CreateFileUploaderParams): FilesService {
    const maxFileSizeMb = Number(process.env.IB_MAX_FILE_SIZE_MB)
    return {
        write: async ({ fileName, data }: { fileName: string, data: Buffer }): Promise<string> => {
            if (!Buffer.isBuffer(data)) {
                throw new Error(
                    `Expected file data to be a Buffer, but received ${typeof data === 'object' ? Object.prototype.toString.call(data) : typeof data}`,
                )
            }
            validateFileSize(data, maxFileSizeMb)
            const { readUrl } = await engineFileApi.upload({
                engineToken,
                apiUrl,
                fileId: ibId(),
                type: FileType.FLOW_STEP_FILE,
                fileName,
                data,
            })
            return readUrl
        },
    }
}

function validateFileSize(data: Buffer, maxFileSizeMb: number): void {
    const maximumFileSizeInBytes = maxFileSizeMb * 1024 * 1024
    if (data.length > maximumFileSizeInBytes) {
        throw new FileSizeError(data.length / 1024 / 1024, maxFileSizeMb)
    }
}

type CreateFileUploaderParams = {
    apiUrl: string
    engineToken: string
}
