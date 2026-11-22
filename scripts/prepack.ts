/**
 * Only pnpm applies `publishConfig`, which points the exports and bin of the
 * package to `dist`. Packed by anything else they'd point to `src`, and
 * Node.js doesn't strip types under `node_modules`.
 */
const agent = process.env.npm_config_user_agent ?? ''

if (!agent.startsWith('pnpm/')) {
  throw new Error(
    'Pack and publish playwright-test with pnpm, other package managers leave its exports pointing to the TypeScript sources.'
  )
}
