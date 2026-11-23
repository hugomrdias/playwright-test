/** biome-ignore-all lint/suspicious/noConsole: test */
import fs from 'node:fs'
import os from 'node:os'

const hasProfile = () =>
  fs.readdirSync(os.tmpdir()).some((name) => name.includes('dev_profile-'))

export default {
  // The browser closes while this hook runs, and Playwright deletes the profile
  async afterTests() {
    const start = Date.now()
    while (hasProfile() && Date.now() - start < 10_000) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    console.log(hasProfile() ? 'profile left' : 'profile deleted')
  },
}
