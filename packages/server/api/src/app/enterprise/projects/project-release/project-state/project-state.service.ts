// Clean-room implementation — project state derivation (capability spec J.1).
//
// A "project state" is the portable, credential-free snapshot of a workspace's
// automation work: its flows, its connection references (external id + block, never
// the secret value), and its tables. It is the unit that git-sync serializes and that
// a PROJECT/GIT/ROLLBACK release imports into a target workspace.
//
// `getTableState` and `getFlowState` are pure, deterministic mappings that normalize a
// populated entity down to its exportable shape (extra runtime properties are dropped by
// re-parsing through the shared zod schema). `getTableState` is COMMUNITY-REACHABLE — it
// backs the core table->template export (table.service.getTemplate, all editions) — so it
// must always produce a correct TableState.
import {
    ConnectionState,
    DiffState,
    FieldType,
    FlowOperationStatus,
    FlowProjectOperationType,
    FlowState,
    FlowStatus,
    FlowSyncError,
    isNil,
    PopulatedFlow,
    PopulatedTable,
    ProjectId,
    ProjectState,
    TableState,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { appConnectionService } from '../../../../app-connection/app-connection-service/app-connection-service'
import { flowService } from '../../../../flows/flow/flow.service'
import { flowMigrations } from '../../../../flows/flow-version/migrations'
import { fieldService } from '../../../../tables/field/field.service'
import { tableService } from '../../../../tables/table/table.service'
import { projectStateHelper } from './project-state-helper'

const EXPORT_FLOW_LIMIT = 1000

export const projectStateService = (log: FastifyBaseLogger) => ({
    // Normalize a populated flow to its exportable FlowState: migrate the version to the
    // current schema, default a missing operationStatus (older git-stored flows predate the
    // field), and strip any extra runtime-only properties down to the known FlowState shape.
    // (We pick the known keys rather than schema-parse, so this is a lossless normalization
    // that never rejects a stored flow on validation.)
    async getFlowState(flow: PopulatedFlow): Promise<FlowState> {
        const migratedVersion = await flowMigrations.apply(flow.version, { log })
        return {
            id: flow.id,
            created: flow.created,
            updated: flow.updated,
            projectId: flow.projectId,
            externalId: flow.externalId,
            ownerId: flow.ownerId,
            folderId: flow.folderId,
            status: flow.status,
            publishedVersionId: flow.publishedVersionId,
            metadata: flow.metadata,
            operationStatus: flow.operationStatus ?? FlowOperationStatus.NONE,
            timeSavedPerRun: flow.timeSavedPerRun,
            templateId: flow.templateId,
            createdBy: flow.createdBy,
            version: migratedVersion,
            ...(isNil(flow.triggerSource) ? {} : { triggerSource: flow.triggerSource }),
        }
    },

    // Normalize a populated table to its exportable TableState (pure mapping).
    getTableState(populatedTable: PopulatedTable): TableState {
        const fields = populatedTable.fields.map((field) => ({
            name: field.name,
            type: field.type,
            // Only STATIC_DROPDOWN fields carry options data; others have none.
            data: field.type === FieldType.STATIC_DROPDOWN ? field.data : null,
            externalId: field.externalId,
        }))
        return {
            id: populatedTable.id,
            name: populatedTable.name,
            externalId: populatedTable.externalId,
            fields,
            status: populatedTable.status,
            trigger: populatedTable.trigger,
        }
    },

    // Snapshot an entire workspace into a portable, credential-free ProjectState: its
    // flows (published where available, otherwise latest draft), its connection references
    // (external id + block + name only — never the secret value), and its tables.
    async getProjectState({ projectId }: GetProjectStateParams): Promise<ProjectState> {
        // `list` takes projectIds XOR platformId. Scoping to the single project is the tighter
        // filter, so passing platformId alongside it is both invalid and redundant.
        const flowsPage = await flowService(log).list({
            projectIds: [projectId],
            cursorRequest: null,
            limit: EXPORT_FLOW_LIMIT,
            folderId: undefined,
            status: undefined,
            name: undefined,
        })
        const flows: FlowState[] = await Promise.all(
            flowsPage.data.map((flow) => this.getFlowState(flow)),
        )

        const connections: ConnectionState[] = await appConnectionService(log).getManyConnectionStates({
            projectId,
        })

        const tablesPage = await tableService.list({
            projectId,
            cursor: undefined,
            limit: EXPORT_FLOW_LIMIT,
            name: undefined,
            externalIds: undefined,
            folderId: undefined,
            folderIds: undefined,
            includeRowCount: false,
        })
        const tables: TableState[] = await Promise.all(
            tablesPage.data.map(async (table) => {
                const fields = await fieldService.getAll({ projectId, tableId: table.id })
                const populated: PopulatedTable = { ...table, fields }
                return this.getTableState(populated)
            }),
        )

        return {
            flows,
            connections,
            tables,
        }
    },

    // Apply a diff's flow operations into the target project, delegating each mutation to
    // projectStateHelper. Operations run sequentially in the order given; a create/update/
    // delete failure aborts the apply (propagated), while a failure to *republish* a flow is
    // collected as a FlowSyncError and does not stop the remaining operations — a single
    // invalid flow must not block a whole release. Unknown operation types are skipped.
    //
    // NOTE: this is deliberately NOT wrapped in a DB transaction. Applying a project state
    // schedules out-of-band work (trigger registration on publish) that cannot live inside a
    // SQL transaction, and recovery is by idempotent re-run keyed on external id — so partial
    // progress is safe and expected, not a corruption.
    async apply({ projectId, diffs }: ApplyParams): Promise<FlowSyncError[]> {
        const helper = projectStateHelper(log)
        const publishErrors: FlowSyncError[] = []

        for (const operation of diffs.flows) {
            switch (operation.type) {
                case FlowProjectOperationType.CREATE_FLOW: {
                    const created = await helper.createFlowInProject(operation.flowState, projectId)
                    // New flows are enabled by default on import.
                    const error = await helper.republishFlow({ flow: created, projectId, status: FlowStatus.ENABLED })
                    if (error) {
                        publishErrors.push(error)
                    }
                    break
                }
                case FlowProjectOperationType.UPDATE_FLOW: {
                    const updated = await helper.updateFlowInProject(operation.flowState, operation.newFlowState, projectId)
                    // Updates preserve the target flow's existing enabled/disabled status.
                    const error = await helper.republishFlow({ flow: updated, projectId, status: operation.flowState.status })
                    if (error) {
                        publishErrors.push(error)
                    }
                    break
                }
                case FlowProjectOperationType.DELETE_FLOW: {
                    await helper.deleteFlowFromProject(operation.flowState.id, projectId)
                    break
                }
                default:
                    // Unknown operation type — skip defensively.
                    break
            }
        }
        return publishErrors
    },
})

type GetProjectStateParams = {
    projectId: ProjectId
    platformId: string
}

type ApplyParams = {
    projectId: ProjectId
    diffs: DiffState
    platformId: string
    log: FastifyBaseLogger
}
