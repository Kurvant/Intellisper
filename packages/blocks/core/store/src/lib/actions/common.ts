import { Property, StoreScope } from "@intelblocks/blocks-framework"

export enum BlockStoreScope {
    PROJECT = 'COLLECTION',
    FLOW = 'FLOW',
    RUN = 'RUN',
}

const testRunId = 'test-run-id-CbVidYfEuCRpUanfEb3RU';
export function getScopeAndKey(params: Params): { scope: StoreScope, key: string } {
    switch (params.scope) {
        case BlockStoreScope.PROJECT:
            return { scope: StoreScope.PROJECT, key: params.key }
        case BlockStoreScope.FLOW:
            return { scope: StoreScope.FLOW, key: params.key }
        case BlockStoreScope.RUN:
            // Use a consistent test run ID when testing to allow store operations to work together
            {
                const runId = params.isTestMode ? testRunId : params.runId
                return { scope: StoreScope.FLOW, key: `run_${runId}/${params.key}` }
            }
    }
}

type Params = {
    runId: string
    key: string
    scope: BlockStoreScope
    isTestMode: boolean
}

export const common = {
    store_scope: Property.StaticDropdown({
        displayName: 'Store Scope',
        description: 'The storage scope of the value.',
        required: true,
        options: {
            options: [
                {
                    label: 'Project',
                    value: BlockStoreScope.PROJECT,
                },
                {
                    label: 'Flow',
                    value: BlockStoreScope.FLOW,
                },
                {
                    label: 'Run',
                    value: BlockStoreScope.RUN,
                },
            ],
        },
        defaultValue: BlockStoreScope.PROJECT,
    })
}