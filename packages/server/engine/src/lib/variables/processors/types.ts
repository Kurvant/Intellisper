
/* eslint-disable @typescript-eslint/no-explicit-any */
import { BlockProperty } from '@intelblocks/blocks-framework'

export type ProcessorFn<INPUT = any, OUTPUT = any> = (
    property: BlockProperty,
    value: INPUT,
) => OUTPUT
