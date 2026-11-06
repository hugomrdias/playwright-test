localStorage.setItem('fromBefore', '1')
// biome-ignore lint/suspicious/noDocumentCookie: test
document.cookie = 'fromBefore=1'
// biome-ignore lint/style/noRestrictedGlobals: test
self.PW_TEST.beforeEnd()
