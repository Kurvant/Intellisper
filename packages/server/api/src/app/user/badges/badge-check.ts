import { ApplicationEvent, BADGES } from '@intelblocks/shared'

export type BadgeCheckResult = {
    userId: string | null
    badges: (keyof typeof BADGES)[]
}

export type BadgeCheck = {
    eval: (applicationEvent: ApplicationEvent) => Promise<BadgeCheckResult>
}
