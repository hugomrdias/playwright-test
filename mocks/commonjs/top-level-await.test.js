// esbuild turns this into an `await` in a function that isn't async, the error
// from parsing the bundle has no stack
import './top-level-await.mjs'
