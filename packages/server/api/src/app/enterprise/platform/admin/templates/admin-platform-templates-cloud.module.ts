// Clean-room implementation — operator template administration (capability spec C.5 /
// J.2). Lets the operator curate the official (platform-owned) template library and the
// template-category flag. Guarded by a dedicated templates operator key, separate from
// the general operator key, so template curation can be delegated independently.
import {
    IntellisperError,
    IbFlagId,
    CreateTemplateRequestBody,
    ErrorCode,
    isNil,
    TemplateType,
    UpdateTemplateRequestBody,
    UpdateTemplatesCategoriesFlagRequestBody,
} from '@intelblocks/shared'
import { FastifyReply, FastifyRequest } from 'fastify'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../../../../core/security/authorization/fastify-security'
import { flagService } from '../../../../flags/flag.service'
import { migrateFlowVersionTemplateList } from '../../../../flows/flow-version/migrations'
import { system } from '../../../../helper/system/system'
import { AppSystemProp } from '../../../../helper/system/system-props'
import { templateService } from '../../../../template/template.service'

const TEMPLATES_KEY_HEADER = 'templates-api-key'

async function assertTemplatesKey(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const configuredKey = system.get(AppSystemProp.TEMPLATES_API_KEY)
    const presentedKey = request.headers[TEMPLATES_KEY_HEADER] as string | undefined
    if (isNil(configuredKey) || presentedKey !== configuredKey) {
        await reply.status(StatusCodes.FORBIDDEN).send({ message: 'Forbidden' })
        throw new Error('Forbidden')
    }
}

export const adminPlatformTemplatesCloudModule: FastifyPluginAsyncZod = async (app) => {
    app.addHook('preHandler', assertTemplatesKey)
    await app.register(adminPlatformTemplatesCloudController, { prefix: '/v1/admin/templates' })
}

const publicRoute = { config: { security: securityAccess.public() } }

const adminPlatformTemplatesCloudController: FastifyPluginAsyncZod = async (app) => {

    // Set the curated template-category list surfaced to browsers.
    app.post('/categories', { ...publicRoute, schema: { body: UpdateTemplatesCategoriesFlagRequestBody } }, async (request) => {
        return flagService(request.log).save({ id: IbFlagId.TEMPLATES_CATEGORIES, value: request.body.value })
    })

    // Fetch a single official template.
    app.get('/:id', { ...publicRoute, schema: { params: z.object({ id: z.string() }) } }, async (request) => {
        const template = await templateService(app.log).getOneOrThrow({ id: request.params.id })
        assertOfficial(template.type)
        return template
    })

    // Create an official template (operator-curated; not tied to any organization).
    app.post('/', {
        ...publicRoute,
        schema: { body: CreateTemplateRequestBody },
        preValidation: async (request: FastifyRequest) => {
            const body = request.body as { flows?: Parameters<typeof migrateFlowVersionTemplateList>[0] }
            body.flows = await migrateFlowVersionTemplateList(body.flows ?? [])
        },
    }, async (request) => {
        assertOfficial(request.body.type)
        return templateService(app.log).create({ platformId: undefined, params: request.body })
    })

    // Update an official template.
    app.post('/:id', {
        ...publicRoute,
        schema: { params: z.object({ id: z.string() }), body: UpdateTemplateRequestBody },
        preValidation: async (request: FastifyRequest) => {
            const body = request.body as { flows?: Parameters<typeof migrateFlowVersionTemplateList>[0] }
            body.flows = await migrateFlowVersionTemplateList(body.flows ?? [])
        },
    }, async (request) => {
        return templateService(app.log).update({ id: request.params.id, params: request.body })
    })
}

// This surface curates the OFFICIAL library only; reject any other template type.
function assertOfficial(type: TemplateType): void {
    if (type !== TemplateType.OFFICIAL) {
        throw new IntellisperError({
            code: ErrorCode.VALIDATION,
            params: { message: 'Only official templates are supported on this surface.' },
        })
    }
}
