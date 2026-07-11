// Clean-room implementation — organization template library (capability spec J.2). Manages the
// custom (organization-scoped) automation templates an organization curates for its own workspaces.
//
// Reached only for TemplateType.CUSTOM (platform-scoped) templates — an enterprise capability.
// OFFICIAL/SHARED templates are persisted by the core template service; this service owns the
// create/update of CUSTOM templates. Listing, reading, and deletion of CUSTOM templates (and their
// owner-only authorization) are handled by the core template service + controller, which delegate
// here for the two writes.
//
// A CUSTOM template is scoped to its owning organization (platformId) and published on create.
import {
    ibId,
    FlowVersionTemplate,
    isNil,
    Metadata,
    spreadIfDefined,
    Template,
    TemplateStatus,
    TemplateTag,
    TemplateType,
    UpdateTemplateRequestBody,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { repoFactory } from '../../core/db/repo-factory'
import { templateValidator } from '../../template/template-validator'
import { TemplateEntity } from '../../template/template.entity'

const templateRepo = repoFactory<Template>(TemplateEntity)

type NewTemplate = Omit<Template, 'created' | 'updated'>

export const platformTemplateService = (log: FastifyBaseLogger) => ({
    // Create an organization-scoped custom template. The flows/blocks are already validated and
    // prepared by the core template service before delegation; this persists the record scoped to
    // the owning organization, published.
    async create(params: {
        platformId: string | undefined
        name: string
        summary: string
        description: string
        blocks: string[]
        tags: TemplateTag[]
        blogUrl?: string
        metadata: Metadata | null
        author: string
        categories: string[]
        flows: FlowVersionTemplate[]
    }): Promise<Template> {
        const newTemplate: NewTemplate = {
            id: ibId(),
            name: params.name,
            type: TemplateType.CUSTOM,
            summary: params.summary,
            description: params.description,
            platformId: params.platformId ?? null,
            tags: params.tags,
            blogUrl: params.blogUrl ?? null,
            metadata: params.metadata,
            author: params.author,
            categories: params.categories,
            blocks: params.blocks,
            flows: params.flows,
            status: TemplateStatus.PUBLISHED,
        }
        return templateRepo().save(newTemplate)
    },

    // Update an organization-scoped custom template. Only the provided fields are changed; flows,
    // when supplied, are re-validated and their blocks recomputed (matching the core update path).
    // Ownership/organization-scoping is enforced by the controller before this runs.
    async update({ id, params }: { id: string, params: UpdateTemplateRequestBody }): Promise<Template> {
        const { name, summary, description, tags, blogUrl, metadata, categories, status } = params

        let sanitizedFlows: FlowVersionTemplate[] | undefined = undefined
        let blocks: string[] | undefined = undefined
        if (!isNil(params.flows) && params.flows.length > 0) {
            const prepared = await templateValidator.validateAndPrepare({
                flows: params.flows,
                platformId: undefined,
                log,
            })
            sanitizedFlows = prepared.flows
            blocks = prepared.blocks
        }

        await templateRepo().update(id, {
            ...spreadIfDefined('name', name),
            ...spreadIfDefined('summary', summary),
            ...spreadIfDefined('description', description),
            ...spreadIfDefined('tags', tags),
            ...spreadIfDefined('blogUrl', blogUrl),
            ...spreadIfDefined('metadata', metadata),
            ...spreadIfDefined('categories', categories),
            ...spreadIfDefined('flows', sanitizedFlows),
            ...spreadIfDefined('pieces', blocks),
            ...spreadIfDefined('status', status),
        })
        return templateRepo().findOneByOrFail({ id })
    },
})
