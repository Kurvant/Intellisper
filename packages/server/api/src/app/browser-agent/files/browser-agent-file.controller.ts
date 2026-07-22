import {
    BrowserAgentFileDownloadResponse,
    BrowserAgentFileUploadResponse,
    ErrorCode,
    IbMultipartFile,
    IntellisperError,
    PrincipalType,
} from '@intelblocks/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { ProjectResourceType } from '../../core/security/authorization/common'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { agentFileService } from './agent-file.service'
import { fileFormat } from './file-format'

/**
 * Edit-track file upload + download. Only the EDIT track persists (read-track content is inlined
 * into a chat turn client-side). Owner-scoped; the upload dedupes by content hash. Requires S3.
 */
const ALLOWED_MIMES = new Set([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
])
const MAX_BYTES = 20 * 1024 * 1024

export const browserAgentFileController: FastifyPluginAsyncZod = async (app) => {
    app.post('/', {
        config: { security: securityAccess.project([PrincipalType.USER], undefined, { type: ProjectResourceType.QUERY }) },
        schema: {
            tags: ['browser-agent'],
            description: 'Upload an edit-track file for the agent to work on.',
            consumes: ['multipart/form-data'],
            body: z.object({ file: IbMultipartFile }),
            response: { [StatusCodes.OK]: BrowserAgentFileUploadResponse },
        },
    }, async (request, reply) => {
        const file = request.body.file as IbMultipartFile
        const mime = file.mimetype ?? ''
        if (!ALLOWED_MIMES.has(mime)) {
            throw new IntellisperError({ code: ErrorCode.VALIDATION, params: { message: `Unsupported file type: ${mime}` } })
        }
        if (file.data.length > MAX_BYTES) {
            throw new IntellisperError({ code: ErrorCode.VALIDATION, params: { message: 'File is too large (max 20MB).' } })
        }
        const scope = { userId: request.principal.id, platformId: request.principal.platform.id }
        const saved = await agentFileService(request.log).persist(scope, { name: file.filename ?? 'file', mime, bytes: file.data })
        await reply.status(StatusCodes.OK).send({ ...saved, editable: fileFormat.isEditable(saved.mime) })
    })

    app.get('/:id/download', {
        config: { security: securityAccess.project([PrincipalType.USER], undefined, { type: ProjectResourceType.QUERY }) },
        schema: {
            tags: ['browser-agent'],
            description: 'Get a presigned download URL for an agent file.',
            params: z.object({ id: z.string() }),
            querystring: z.object({ projectId: z.string() }),
            response: { [StatusCodes.OK]: BrowserAgentFileDownloadResponse },
        },
    }, async (request, reply) => {
        const scope = { userId: request.principal.id, platformId: request.principal.platform.id }
        const result = await agentFileService(request.log).downloadUrl(scope, request.params.id)
        if (!result) {
            throw new IntellisperError({ code: ErrorCode.ENTITY_NOT_FOUND, params: { entityType: 'agent_file', entityId: request.params.id } })
        }
        await reply.status(StatusCodes.OK).send(result)
    })
}
