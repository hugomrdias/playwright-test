import path from 'node:path'

/**
 * Only pnpm applies `publishConfig`, which points the exports and bin of the
 * package to `dist`. Packed by anything else they'd point to `src`, and
 * Node.js doesn't strip types under `node_modules`.
 *
 * The user agent alone isn't enough, `pnpm exec npm pack` keeps pnpm's. The
 * exec path is the package manager that runs the script: `npm-cli.js` for npm,
 * and the pnpm binary or script for pnpm.
 */
const agent = process.env.npm_config_user_agent ?? ''
const exec = path.basename(process.env.npm_execpath ?? '')

if (!agent.startsWith('pnpm/') || !/^pnpm\b/i.test(exec)) {
  throw new Error(
    'Pack and publish playwright-test with pnpm, other package managers leave its exports pointing to the TypeScript sources.'
  )
}
