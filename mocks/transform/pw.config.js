export default {
  buildConfig: {
    define: { __DEFINED__: '"defined"' },
    loader: { '.txt': 'text' },
    jsx: 'transform',
    jsxFactory: 'createElement',
    tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    // bundle only, a per-file transform has to ignore these
    bundle: true,
    external: ['*'],
    plugins: [
      {
        name: 'throws',
        setup() {
          throw new Error('plugins should be ignored in node mode')
        },
      },
    ],
  },
}
