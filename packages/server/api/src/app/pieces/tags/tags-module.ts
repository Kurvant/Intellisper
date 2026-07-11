import { assertNotNullOrUndefined, DeleteTagRequest, ListTagsRequest, PrincipalType, SeekPage, SetBlockTagsRequest, Tag, UpsertTagRequest } from '@intelblocks/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { blockTagService } from './pieces/piece-tag.service'
import { tagService } from './tag-service'


export const tagsModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(tagsController, { prefix: '/v1/tags' })
}


const tagsController: FastifyPluginAsyncZod = async (fastify) => {

    fastify.get('/', ListTagsParams,
        async (request) => {
            const platformId = request.principal.platform.id
            assertNotNullOrUndefined(platformId, 'platformId')
            return tagService.list({
                platformId,
                request: request.query,
            })
        },
    )

    fastify.post('/', UpsertTagParams, async (req, reply) => {
        const platformId = req.principal.platform.id
        const tag = await tagService.upsert(platformId, req.body.name)
        await reply.status(StatusCodes.CREATED).send(tag)
    })

    fastify.post('/pieces', setBlocksTagsParams, async (req, reply) => {
        const platformId = req.principal.platform.id
        const blocks = req.body.blocksName.map(blockName => blockTagService.set(platformId, blockName, req.body.tags))
        await Promise.all(blocks)
        await reply.status(StatusCodes.CREATED).send({})
    })

    fastify.delete('/:id', DeleteTagParams, async (req, reply) => {
        const platformId = req.principal.platform.id
        await tagService.delete(platformId, req.params.id)
        await reply.status(StatusCodes.NO_CONTENT).send()
    })

}

const UpsertTagParams = {
    config: {
        security: securityAccess.platformAdminOnly([PrincipalType.USER]),
    },
    schema: {
        body: UpsertTagRequest,
        response: {
            [StatusCodes.CREATED]: Tag,
        },
    },
}

const setBlocksTagsParams = {
    config: {
        security: securityAccess.platformAdminOnly([PrincipalType.USER, PrincipalType.SERVICE]),
    },
    schema: {
        body: SetBlockTagsRequest,
        response: {
            [StatusCodes.CREATED]: z.object({}),
        },
    },
}

const DeleteTagParams = {
    config: {
        security: securityAccess.platformAdminOnly([PrincipalType.USER]),
    },
    schema: {
        params: DeleteTagRequest,
        response: {
            [StatusCodes.NO_CONTENT]: z.undefined(),
        },
    },
}

const ListTagsParams = {
    config: {
        security: securityAccess.platformAdminOnly([PrincipalType.USER]),
    },
    schema: {
        querystring: ListTagsRequest,
        response: {
            [StatusCodes.OK]: SeekPage(Tag),
        },
    },
}