import { z } from "zod";
import { BasePropertySchema, TPropertyValue } from "./common";
import { PropertyType } from "./property-type";

export class IbFile {
    constructor(
        public filename: string,
        public data: Buffer,
        public extension?: string
    ) { }

    get base64(): string {
        return this.data.toString('base64');
    }
}

export const FileProperty = z.object({
    ...BasePropertySchema.shape,
    ...TPropertyValue(z.unknown(), PropertyType.FILE).shape,
})

export type FileProperty<R extends boolean> = BasePropertySchema &
    TPropertyValue<IbFile, PropertyType.FILE, R>;
