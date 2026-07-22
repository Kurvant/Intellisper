import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'

/**
 * Write an array-valued **jsonb** column through `Repository.update()`.
 *
 * WHY THIS EXISTS — `update()` types its patch as `QueryDeepPartialEntity<Entity>`, which recurses
 * into every object/array property to allow partial *relational* updates. A jsonb column is not
 * relational: it is one opaque document stored verbatim. For an array of records or of a
 * discriminated union, that recursion produces a type no concrete value can satisfy
 * (`_QueryDeepPartialEntity<T>[]`, where each element is additionally widened with `(() => string)`
 * and `undefined`), so a perfectly valid payload is rejected.
 *
 * The mismatch is in TypeORM's types, not in the caller. Verified: neither
 * `QueryDeepPartialEntity<T>` at the call site, nor reshaping the EntitySchema generic, nor
 * `satisfies` avoids it. `save()` type-checks but is NOT equivalent — it upserts and
 * loads-then-writes, which would change behaviour.
 *
 * So the boundary is stated ONCE, here, typed per element to match what `update()` expects for an
 * array column. This is an identity function at runtime: the value is passed through untouched and
 * TypeORM serialises it to jsonb exactly as before.
 */
export function jsonbArray<E>(value: E[]): QueryDeepPartialEntity<E>[] {
    return value as QueryDeepPartialEntity<E>[]
}
