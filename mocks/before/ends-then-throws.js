// biome-ignore lint/style/noRestrictedGlobals: test
self.PW_TEST.beforeEnd()

throw new Error('before script threw after ending')
