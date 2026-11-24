// A queue the worker sends to and consumes, every file has the consumer in its own workerd
export default {
  workerd: {
    main: 'src/queue.js',
    miniflare: {
      config: {
        env: { JOBS: { type: 'queue', name: 'jobs' } },
        triggers: [{ type: 'queue', name: 'jobs', maxBatchTimeout: 0 }],
      },
    },
  },
}
