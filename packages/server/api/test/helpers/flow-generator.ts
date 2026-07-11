import { ibId, FlowAction, FlowActionType, FlowOperationStatus, FlowStatus, FlowTrigger, FlowTriggerType, FlowVersion, FlowVersionState, PopulatedFlow, PropertyExecutionType } from '@intelblocks/shared'
import dayjs from 'dayjs'
import { faker } from '@faker-js/faker'


export const flowGenerator = {
    simpleActionAndTrigger(externalId?: string): PopulatedFlow {
        return flowGenerator.randomizeMetadata(externalId, flowVersionGenerator.simpleActionAndTrigger())
    },
    randomizeMetadata(externalId: string | undefined, version: Omit<FlowVersion, 'flowId'>): PopulatedFlow {
        const flowId = ibId()
        const result: PopulatedFlow = {
            externalId: externalId ?? flowId,
            version: {
                ...version,
                trigger: randomizeTriggerMetadata(version.trigger),
                flowId,
            },
            operationStatus: FlowOperationStatus.NONE,
            status: faker.helpers.enumValue(FlowStatus),
            id: flowId,
            projectId: ibId(),
            folderId: ibId(),
            created: faker.date.recent().toISOString(),
            updated: faker.date.recent().toISOString(),
        }
        return result
    },
}

const flowVersionGenerator = {
    simpleActionAndTrigger(): Omit<FlowVersion, 'flowId'> {
        return {
            id: ibId(),
            displayName: faker.animal.dog(),
            created: faker.date.recent().toISOString(),
            updated: faker.date.recent().toISOString(),
            updatedBy: ibId(),
            valid: true,
            trigger: {
                ...randomizeTriggerMetadata(generateTrigger()),
                nextAction: generateAction(),
            },
            state: FlowVersionState.DRAFT,
            connectionIds: [],
            agentIds: [],
            notes: [],
        }
    },
}

function randomizeTriggerMetadata(trigger: FlowTrigger): FlowTrigger {
    return {
        ...trigger,
        settings: {
            ...trigger.settings,
            propertySettings: {
                server: { type: PropertyExecutionType.MANUAL },
                port: { type: PropertyExecutionType.MANUAL },
                username: { type: PropertyExecutionType.DYNAMIC },
                password: { type: PropertyExecutionType.MANUAL },
            },
        },
    }
}
function generateAction(): FlowAction {
    return {
        type: FlowActionType.BLOCK,
        displayName: faker.hacker.noun(),
        name: ibId(),
        skip: false,
        lastUpdatedDate: dayjs().toISOString(),
        settings: {
            input: {},
            blockName: faker.helpers.arrayElement(['@intelblocks/block-schedule', '@intelblocks/block-webhook']),
            blockVersion: faker.system.semver(),
            actionName: faker.hacker.noun(),
            propertySettings: {},
        },
        valid: true,
    }
}

function generateTrigger(): FlowTrigger {
    return {
        type: FlowTriggerType.BLOCK,
        displayName: faker.hacker.noun(),
        name: ibId(),
        lastUpdatedDate: dayjs().toISOString(),
        settings: {
            blockName: faker.helpers.arrayElement(['@intelblocks/block-schedule', '@intelblocks/block-webhook']),
            blockVersion: faker.system.semver(),
            triggerName: faker.hacker.noun(),
            input: {},
            propertySettings: {},
        },
        valid: true,
    }
}