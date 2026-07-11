// Clean-room implementation — enterprise database manager (capability spec I.9). The single
// place that owns the enterprise data-layer contributions to the platform's unified schema:
// the enterprise persistent ENTITIES (registered into the one entity registry) and the
// enterprise MIGRATIONS (merged into the one ordered, forward-only migration list every
// edition runs). Replaces the historical `ee/database` folder.
export { getEnterpriseEntities } from './enterprise-entities'
export { getEnterpriseMigrations } from './enterprise-migrations'
