// OpenCode 2 auto-loads this file from .opencode/plugins/ and does not read
// homie.mjs next to it, so keep the one-line entry here. npm consumers still
// reach the plugin through package.json main/exports.
export { default } from './homie.mjs'