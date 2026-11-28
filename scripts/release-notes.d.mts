/** Files whose version a release tag must match. */
export declare const VERSIONED_FILES: readonly string[]
/** The version a release tag names: v0.8.0 names 0.8.0. */
export declare function tagVersion(tag: string): string
/** Stops when a file states another version than the tag. */
export declare function checkVersions(version: string, files: readonly { file: string; version: unknown }[]): void
/** The Android version number a version needs: 1.2.3 needs 1002003. */
export declare function androidVersionCode(version: string): number
/** Stops when package.json states another Android version number than the version needs. */
export declare function checkAndroidVersionCode(version: string, stated: unknown): void
/** The CHANGELOG entry of a version, without its heading. */
export declare function changelogEntry(changelog: string, version: string): string
