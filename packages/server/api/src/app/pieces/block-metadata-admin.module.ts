// Block catalogue admin surface — the OPERATOR (Intellisper company) write path for block metadata.
//
// Why this exists: the block catalogue is served from the `block_metadata` table, and a fresh
// install's table is empty, so every block picker in the UI is blank until something writes rows.
// Upstream Activepieces solves this the same way: their release pipeline publishes piece packages
// to a registry and then POSTs each piece's metadata to their own cloud instance
// (`tools/scripts/pieces/update-pieces-metadata.ts` -> `POST /v1/admin/pieces`). Every OTHER
// install then syncs that catalogue down via PIECES_SYNC_MODE=OFFICIAL_AUTO.
//
// Intellisper is in the position of the ORIGIN (there is no upstream catalogue to sync from — the
// blocks are ours, published to GitHub Packages as `@intelblocks/block-*`), so this endpoint is
// how the catalogue is populated and kept current. Only METADATA is stored; block code is never
// held here. At execution time the worker resolves the package by name/version and installs it
// into a sandbox, which is what keeps the API image small and untrusted dependency trees out of
// the request-serving process.
//
// Access model is copied deliberately from `ai-gateway-admin.module.ts` (the operator surface),
// because a catalogue WRITE has operator-level blast radius — a bad actor who could write here
// would control what code every tenant's flows resolve and execute:
//
//   1. The whole surface is gated by the OPERATOR KEY (`AppSystemProp.API_KEY`) in a request
//      header. Deny-by-default: if no key is configured the surface is CLOSED, never open.
//   2. Routes are otherwise `public()` — the header check is the entire gate, so no tenant
//      principal (JWT) can reach it. `platformAdminOnly` would mean "an admin of ANY tenant" on a
//      multi-tenant cloud install, which must never be able to publish blocks to everyone.
//   3. Rows are written with `platformId: undefined` and blockType=OFFICIAL / packageType=REGISTRY,
//      which is exactly what makes a block visible in every project's catalogue.
import { timingSafeEqual } from 'crypto'
import { BlockType, IbEdition, isNil, PackageType } from '@intelblocks/shared'
import { FastifyReply, FastifyRequest } from 'fastify'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { blockMetadataService } from './metadata/piece-metadata-service'

const OPERATOR_KEY_HEADER = 'api-key'

/**
 * Gate the whole surface. Two independent checks, either of which alone denies.
 *
 * The comparison is length-checked before `timingSafeEqual` because that function throws on
 * mismatched lengths; comparing this way avoids leaking key length through an exception path and
 * avoids the early-exit character comparison a plain `!==` would perform.
 */
export async function assertBlockCatalogueOperator(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const configuredKey = system.get(AppSystemProp.API_KEY)
    const presentedKey = request.headers[OPERATOR_KEY_HEADER] as string | undefined

    let keyMatches = false
    if (!isNil(configuredKey) && !isNil(presentedKey)) {
        const a = Buffer.from(configuredKey)
        const b = Buffer.from(presentedKey)
        keyMatches = a.length === b.length && timingSafeEqual(a, b)
    }

    const denied = system.getEdition() !== IbEdition.CLOUD || isNil(configuredKey) || !keyMatches
    if (denied) {
        await reply.status(StatusCodes.FORBIDDEN).send({ message: 'Forbidden' })
        throw new Error('Forbidden')
    }
}

export const blockMetadataAdminModule: FastifyPluginAsyncZod = async (app) => {
    app.addHook('preHandler', assertBlockCatalogueOperator)
    await app.register(blockMetadataAdminController, { prefix: '/v1/admin/blocks' })
}

const blockMetadataAdminController: FastifyPluginAsyncZod = async (app) => {
    // Public per-route: the operator-key preHandler above is the sole gate, by design.
    const publicRoute = { config: { security: securityAccess.public() } }

    app.post('/', {
        ...publicRoute,
        schema: {
            tags: ['blocks'],
            description: 'Operator-only: publish a block\'s metadata into the catalogue. Gated by the operator key; not reachable by any tenant principal.',
        },
    }, async (request, reply) => {
        const blockMetadata = request.body as Parameters<ReturnType<typeof blockMetadataService>['create']>[0]['blockMetadata']

        // Re-publishing an unchanged (name, version) is normal for a pipeline that re-runs, so a
        // duplicate is reported as CONFLICT rather than an error the caller has to special-case.
        // This mirrors upstream's updater, which treats 200 and 409 as equally successful.
        try {
            const created = await blockMetadataService(request.log).create({
                blockMetadata,
                // Null platformId + OFFICIAL + REGISTRY is what `isOfficialBlock` requires for the
                // block to appear in every project's catalogue.
                platformId: undefined,
                packageType: PackageType.REGISTRY,
                blockType: BlockType.OFFICIAL,
                publishCacheRefresh: false,
            })
            await reply.status(StatusCodes.OK).send({ name: created.name, version: created.version })
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            if (message.includes('piece_metadata_already_exists')) {
                await reply.status(StatusCodes.CONFLICT).send({ message: 'already_exists' })
                return
            }
            throw error
        }
    })
}
