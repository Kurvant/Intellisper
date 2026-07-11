// Clean-room implementation — the imperative half of project-state apply (capability spec
// J.1). projectStateService.apply computes *what* to do from a diff; this helper performs
// each individual mutation against the target workspace: create/update/delete a flow, and
// (re)publish a flow to a desired enabled/disabled status.
//
// Flows are matched across workspaces by their external id (the universal correlation key),
// so an update targets the right row regardless of the source's local id, and a re-run is
// idempotent. Republish returns a structured FlowSyncError instead of throwing when the flow
// cannot be validly published (e.g. an incomplete step), so a single bad flow does not abort
// the whole apply — while genuine create/update/delete failures propagate.
import {
    Flow,
    FlowOperationType,
    FlowState,
    FlowStatus,
    FlowSyncError,
    isNil,
    PopulatedFlow,
    ProjectId,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { flowRepo } from '../../../../flows/flow/flow.repo'
import { flowService } from '../../../../flows/flow/flow.service'
import { projectService } from '../../../../project/project-service'

function externalIdOf(flow: FlowState): string {
    return flow.externalId ?? flow.id
}

export const projectStateHelper = (log: FastifyBaseLogger) => ({

    // Provision a new flow in the target project carrying the source's external id, then
    // import the source version's definition into it. Returns the created flow.
    async createFlowInProject(flowState: FlowState, projectId: ProjectId): Promise<PopulatedFlow> {
        const project = await projectService(log).getOneOrThrow(projectId)
        const createdFlow = await flowService(log).create({
            projectId,
            externalId: externalIdOf(flowState),
            ownerId: project.ownerId,
            request: {
                displayName: flowState.version.displayName,
                projectId,
            },
        })
        return this.importVersion(createdFlow.id, flowState, projectId, project.platformId)
    },

    // Import the source version's definition onto an existing target flow (matched by its
    // external id). Returns the updated flow.
    async updateFlowInProject(currentFlowState: FlowState, newFlowState: FlowState, projectId: ProjectId): Promise<PopulatedFlow> {
        const project = await projectService(log).getOneOrThrow(projectId)
        const existing = await findFlowByExternalId(externalIdOf(currentFlowState), projectId)
        if (isNil(existing)) {
            // Nothing to update against — converge by creating it instead.
            return this.createFlowInProject(newFlowState, projectId)
        }
        return this.importVersion(existing.id, newFlowState, projectId, project.platformId)
    },

    async deleteFlowFromProject(flowId: string, projectId: ProjectId): Promise<void> {
        const existing = await flowRepo().findOneBy({ id: flowId, projectId })
        if (isNil(existing)) {
            const byExternal = await flowRepo().findOneBy({ externalId: flowId, projectId })
            if (isNil(byExternal)) {
                return
            }
            await flowService(log).delete({ id: byExternal.id, projectId })
            return
        }
        await flowService(log).delete({ id: existing.id, projectId })
    },

    // Publish the flow's latest version and set its enabled/disabled status. A validation
    // failure is returned as a FlowSyncError (not thrown) so the apply can record it and
    // continue with the remaining flows.
    async republishFlow({ flow, projectId, status }: RepublishParams): Promise<FlowSyncError | null> {
        try {
            const project = await projectService(log).getOneOrThrow(projectId)
            await flowService(log).update({
                id: flow.id,
                userId: project.ownerId,
                projectId,
                platformId: project.platformId,
                operation: {
                    type: FlowOperationType.LOCK_AND_PUBLISH,
                    request: { status },
                },
            })
            return null
        }
        catch (error) {
            log.warn({ error, flowId: flow.id, projectId }, 'Failed to republish flow during project apply')
            return {
                flowId: flow.id,
                message: error instanceof Error ? error.message : 'Failed to publish flow',
            }
        }
    },

    // Apply a source version's definition to a target flow via IMPORT_FLOW. Shared by
    // create and update.
    async importVersion(flowId: string, source: FlowState, projectId: ProjectId, platformId: string): Promise<PopulatedFlow> {
        const project = await projectService(log).getOneOrThrow(projectId)
        return flowService(log).update({
            id: flowId,
            userId: project.ownerId,
            projectId,
            platformId,
            operation: {
                type: FlowOperationType.IMPORT_FLOW,
                request: {
                    displayName: source.version.displayName,
                    trigger: source.version.trigger,
                    schemaVersion: source.version.schemaVersion ?? null,
                    notes: source.version.notes ?? [],
                },
            },
        })
    },
})

async function findFlowByExternalId(externalId: string, projectId: ProjectId): Promise<Flow | null> {
    const byExternal = await flowRepo().findOneBy({ externalId, projectId })
    if (!isNil(byExternal)) {
        return byExternal
    }
    return flowRepo().findOneBy({ id: externalId, projectId })
}

type RepublishParams = {
    flow: Pick<PopulatedFlow, 'id'> & Partial<PopulatedFlow>
    projectId: ProjectId
    status: FlowStatus
}
