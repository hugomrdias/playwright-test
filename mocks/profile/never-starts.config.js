import { fileURLToPath } from 'node:url'

export default {
  launchOptions: {
    executablePath: fileURLToPath(new URL('never-starts.sh', import.meta.url)),
  },
}
