import semverMajor from 'semver/functions/major'
import semverMinor from 'semver/functions/minor'
import semverMinVersion from 'semver/ranges/min-version'

export const getBlockMajorAndMinorVersion = (blockVersion: string): string => {
    const minimumSemver = semverMinVersion(blockVersion)
    return minimumSemver
        ? `${semverMajor(minimumSemver)}.${semverMinor(minimumSemver)}`
        : `${semverMajor(blockVersion)}.${semverMinor(blockVersion)}`
}
