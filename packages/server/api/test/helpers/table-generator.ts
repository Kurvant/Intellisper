import { ibId, Field, FieldState, FieldType, PopulatedTable, TableAutomationStatus } from '@intelblocks/shared'
import { faker } from '@faker-js/faker'

export const tableGenerator = {
    simpleTable(table: Partial<PopulatedTable>): PopulatedTable {
        const tableId = ibId()
        return {
            id: tableId,
            name: faker.lorem.word(),
            externalId: table.externalId ?? ibId(),
            fields: table.fields ?? [
                tableGenerator.generateRandomField(tableId),
                tableGenerator.generateRandomField(tableId),
            ],
            projectId: ibId(),
            created: faker.date.recent().toISOString(),
            updated: faker.date.recent().toISOString(),
            status: table.status ?? TableAutomationStatus.ENABLED,
            trigger: table.trigger ?? null,
        }
    },
    generateRandomField(tableId: string): Field {
        return {
            id: ibId(),
            projectId: ibId(),
            created: faker.date.recent().toISOString(),
            updated: faker.date.recent().toISOString(),
            tableId,
            name: faker.lorem.word(),
            type: FieldType.TEXT,
            externalId: ibId(),
        }
    },
    generateRandomDropdownField(): FieldState {
        return {
            name: faker.lorem.word(),
            type: FieldType.STATIC_DROPDOWN,
            externalId: ibId(),
            data: {
                options: [
                    { value: faker.lorem.word() },
                    { value: faker.lorem.word() },
                ],
            },
        }
    },
} 