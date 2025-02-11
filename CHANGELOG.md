# Changelog

## [14.1.9](https://github.com/hugomrdias/playwright-test/compare/v14.1.8...v14.1.9) (2025-02-11)


### Bug Fixes

* support jsx extension by default ([2652496](https://github.com/hugomrdias/playwright-test/commit/26524961d9c84acef66d3a72270d54a64b4a2c46))

## [14.1.8](https://github.com/hugomrdias/playwright-test/compare/v14.1.7...v14.1.8) (2025-02-10)


### Bug Fixes

* extension testing with new chromium headless ([88b5559](https://github.com/hugomrdias/playwright-test/commit/88b555907a3de713a218ffb48fa0427929fe30a0))
* fix source map support resolve in node runner ([bad569d](https://github.com/hugomrdias/playwright-test/commit/bad569d5b63c4ae0ea27a83d3acccfff0b24257c))
* make it fast again with headless-shell and update playwright ([9bc1b16](https://github.com/hugomrdias/playwright-test/commit/9bc1b16051831c871f3b862e081d0af3b735a9c1))

## [14.1.7](https://github.com/hugomrdias/playwright-test/compare/v14.1.6...v14.1.7) (2024-11-19)


### Bug Fixes

* pass channel to playwright ([#685](https://github.com/hugomrdias/playwright-test/issues/685)) ([810adfb](https://github.com/hugomrdias/playwright-test/commit/810adfb0582f2ff74f8f265b7bf6b1703f9ad2b3))

## [14.1.6](https://github.com/hugomrdias/playwright-test/compare/v14.1.5...v14.1.6) (2024-09-10)


### Bug Fixes

* log playwright browser download progress on stderr ([#682](https://github.com/hugomrdias/playwright-test/issues/682)) ([bb6955c](https://github.com/hugomrdias/playwright-test/commit/bb6955c974dad31c9e071424b4305b2e30e6742e))

## [14.1.5](https://github.com/hugomrdias/playwright-test/compare/v14.1.4...v14.1.5) (2024-09-06)


### Bug Fixes

* typo Count/Could ([#678](https://github.com/hugomrdias/playwright-test/issues/678)) ([9cd2adb](https://github.com/hugomrdias/playwright-test/commit/9cd2adbd16817928cfec590b5092f837647eb442))

## [14.1.4](https://github.com/hugomrdias/playwright-test/compare/v14.1.3...v14.1.4) (2024-07-23)


### Bug Fixes

* updated deps ([1cddcf2](https://github.com/hugomrdias/playwright-test/commit/1cddcf2ad5179706b16ea24bb854c1ce9f8b230c))

## [14.1.3](https://github.com/hugomrdias/playwright-test/compare/v14.1.2...v14.1.3) (2024-05-07)


### Bug Fixes

* test for skipped browser warnings early ([#661](https://github.com/hugomrdias/playwright-test/issues/661)) ([f7248e9](https://github.com/hugomrdias/playwright-test/commit/f7248e971f60282b4156d6f746cc7c85b496d8e4))

## [14.1.2](https://github.com/hugomrdias/playwright-test/compare/v14.1.1...v14.1.2) (2024-05-02)


### Bug Fixes

* allow latest playwright-core ([#658](https://github.com/hugomrdias/playwright-test/issues/658)) ([4c3f7d6](https://github.com/hugomrdias/playwright-test/commit/4c3f7d6d42b88a047434affc2cb2b387baad3ae7))

## [14.1.1](https://github.com/hugomrdias/playwright-test/compare/v14.1.0...v14.1.1) (2024-02-08)


### Bug Fixes

* allow loading gzipped fixtures ([#644](https://github.com/hugomrdias/playwright-test/issues/644)) ([2764b63](https://github.com/hugomrdias/playwright-test/commit/2764b6303490265f597bae27c3aff82cdc6309ca))

## [14.1.0](https://github.com/hugomrdias/playwright-test/compare/v14.0.0...v14.1.0) (2024-01-31)


### Features

* update playwright core and dim browser msgs ([727cc1e](https://github.com/hugomrdias/playwright-test/commit/727cc1e82c41a0d4071f7b214604b58d57da26f4))

## [14.0.0](https://github.com/hugomrdias/playwright-test/compare/v13.0.1...v14.0.0) (2023-11-23)


### ⚠ BREAKING CHANGES

* config function receives cli options and process.env.PW_TEST remove in favor of stringified process.env.PW_OPTIONS

### Features

* config function receives cli options and process.env.PW_TEST remove in favor of stringified process.env.PW_OPTIONS ([6d6892f](https://github.com/hugomrdias/playwright-test/commit/6d6892f5422f158b90c1c984421cf34e10a11d2b))


### Bug Fixes

* update playwright and lilconfig ([0e40e69](https://github.com/hugomrdias/playwright-test/commit/0e40e69bf9e84d4c590b3e28d3eadf6a2ffba905))

## [13.0.1](https://github.com/hugomrdias/playwright-test/compare/v13.0.0...v13.0.1) (2023-11-17)


### Bug Fixes

* make skip and only also a suite ([d7a5c41](https://github.com/hugomrdias/playwright-test/commit/d7a5c417a3ba1c4aed1216a748b3ff39c6215d7d))

## [13.0.0](https://github.com/hugomrdias/playwright-test/compare/v12.6.1...v13.0.0) (2023-11-13)


### ⚠ BREAKING CHANGES

* before/after hooks receive the runner env instead of just the options.

### Features

* before/after hooks receive the runner env instead of just the options. ([b392f7d](https://github.com/hugomrdias/playwright-test/commit/b392f7d9c629927c47ee815c2de1f00fc100accd))

## [12.6.1](https://github.com/hugomrdias/playwright-test/compare/v12.6.0...v12.6.1) (2023-11-13)


### Bug Fixes

* avoid nodejs console.timeEnd warning ([6cf6f6e](https://github.com/hugomrdias/playwright-test/commit/6cf6f6e8b6713dc3df216d189e839dd1e0481fbd))

## [12.6.0](https://github.com/hugomrdias/playwright-test/compare/v12.5.0...v12.6.0) (2023-11-09)


### Features

* add support for .node files ([67300ce](https://github.com/hugomrdias/playwright-test/commit/67300ce4ee086d7ccc76dea5585581efa98cf46b))

## [12.5.0](https://github.com/hugomrdias/playwright-test/compare/v12.4.3...v12.5.0) (2023-11-09)


### Features

* add server url to the client ([454abec](https://github.com/hugomrdias/playwright-test/commit/454abecb72c4180345e5e12c5df3ccf1eac66e1f))

## [12.4.3](https://github.com/hugomrdias/playwright-test/compare/v12.4.2...v12.4.3) (2023-10-19)


### Bug Fixes

* move client to src and export properly ([6238117](https://github.com/hugomrdias/playwright-test/commit/6238117ea74bcf80b4baa55985642b77c93ab6bd))

## [12.4.2](https://github.com/hugomrdias/playwright-test/compare/v12.4.1...v12.4.2) (2023-10-19)


### Bug Fixes

* add client to npm ([d93e74a](https://github.com/hugomrdias/playwright-test/commit/d93e74a22095e8b86abb36a91825af56245de7cb))

## [12.4.1](https://github.com/hugomrdias/playwright-test/compare/v12.4.0...v12.4.1) (2023-10-19)


### Bug Fixes

* normalize logs and stop node run ([4403489](https://github.com/hugomrdias/playwright-test/commit/4403489913cfa25a95a2b5786367e65c8d107f64))

## [12.4.0](https://github.com/hugomrdias/playwright-test/compare/v12.3.8...v12.4.0) (2023-10-17)


### Features

* added playwright/client to exposes browser context methods to the tests ([7111801](https://github.com/hugomrdias/playwright-test/commit/7111801a64524e1974c80883ae9e07fd3a4a3e57)), closes [#540](https://github.com/hugomrdias/playwright-test/issues/540)
* safer exit and logging ([b3710e1](https://github.com/hugomrdias/playwright-test/commit/b3710e137a4f812003f3f985338bb18b7c191019))


### Bug Fixes

* skip before and after hooks when no tests ([2c5ca4f](https://github.com/hugomrdias/playwright-test/commit/2c5ca4ff7af1078cc52af17bb1f154472669c6e2))

## [12.3.8](https://github.com/hugomrdias/playwright-test/compare/v12.3.7...v12.3.8) (2023-10-02)


### Bug Fixes

* improve node errors and suite errors ([43bc597](https://github.com/hugomrdias/playwright-test/commit/43bc597b7c69188f9eb96aad7ea2a849b062b62f))

## [12.3.7](https://github.com/hugomrdias/playwright-test/compare/v12.3.6...v12.3.7) (2023-09-29)


### Bug Fixes

* add NODE_ENV=test, fix autodetect and external msw/node ([62fe8e1](https://github.com/hugomrdias/playwright-test/commit/62fe8e177fd38bce7c72461edbdd6fdbe37afa86))

## [12.3.6](https://github.com/hugomrdias/playwright-test/compare/v12.3.5...v12.3.6) (2023-09-29)


### Bug Fixes

* keep watching even if build fails ([b244658](https://github.com/hugomrdias/playwright-test/commit/b2446582e2246d00062610b65a14b48793960caf))

## [12.3.5](https://github.com/hugomrdias/playwright-test/compare/v12.3.4...v12.3.5) (2023-09-25)


### Bug Fixes

* **deps:** bump playwright-core from 1.38.0 to 1.38.1 ([#593](https://github.com/hugomrdias/playwright-test/issues/593)) ([dd79c5a](https://github.com/hugomrdias/playwright-test/commit/dd79c5a6b68ccc4ede2a3729e5043d91076d84bd))

## [12.3.4](https://github.com/hugomrdias/playwright-test/compare/v12.3.3...v12.3.4) (2023-09-18)


### Miscellaneous Chores

* release 12.3.4 ([4b47065](https://github.com/hugomrdias/playwright-test/commit/4b4706510530938e12e32d2113a23a449da58652))

## [12.3.3](https://github.com/hugomrdias/playwright-test/compare/v12.3.2...v12.3.3) (2023-09-15)


### Bug Fixes

* fix node mode watch and top level imports ([36c8ce2](https://github.com/hugomrdias/playwright-test/commit/36c8ce2210d6e67724a3a0a3fa288f9d7e60d136))

## [12.3.2](https://github.com/hugomrdias/playwright-test/compare/v12.3.1...v12.3.2) (2023-09-15)


### Bug Fixes

* export Suite type ([2ea03ef](https://github.com/hugomrdias/playwright-test/commit/2ea03ef39cb80459cd9a9a04511115834734d243))

## [12.3.1](https://github.com/hugomrdias/playwright-test/compare/v12.3.0...v12.3.1) (2023-09-13)


### Bug Fixes

* export types ([e0f0508](https://github.com/hugomrdias/playwright-test/commit/e0f0508378bdf2cde02dfa352e69a9da2a3e94d0))

## [12.3.0](https://github.com/hugomrdias/playwright-test/compare/v12.2.0...v12.3.0) (2023-09-05)


### Features

* big refactor to taps ([ee90fd6](https://github.com/hugomrdias/playwright-test/commit/ee90fd622e2af58f16574d6b0d5418c75a7912ce))


### Bug Fixes

* fix stack formating in and colors in taps ([c63eebd](https://github.com/hugomrdias/playwright-test/commit/c63eebd4f16a078607f4ab93ca4dd80d4b634e5f))
* remove assert from callback ([4a8c22f](https://github.com/hugomrdias/playwright-test/commit/4a8c22fcbb770471453f6708cb22f59fdb655c4a))

## [12.2.0](https://github.com/hugomrdias/playwright-test/compare/v12.1.2...v12.2.0) (2023-09-01)


### Features

* add assert exports to taps ([6369dcd](https://github.com/hugomrdias/playwright-test/commit/6369dcd5700772617d43961e988da110ee84ed47))


### Bug Fixes

* fix autodetect for mocha only/skip ([d0ae762](https://github.com/hugomrdias/playwright-test/commit/d0ae7621e8ca0af71a2ff549cdae1826f7bef83c)), closes [#572](https://github.com/hugomrdias/playwright-test/issues/572)

## [12.1.2](https://github.com/hugomrdias/playwright-test/compare/v12.1.1...v12.1.2) (2023-08-28)


### Bug Fixes

* taps types and dependabot ([a18cc8c](https://github.com/hugomrdias/playwright-test/commit/a18cc8c095fe763793b5954238269ffbe35037d3))
* taps types and dependabot ([2142223](https://github.com/hugomrdias/playwright-test/commit/21422231ad8f5e27807aa04e55736e5ad8779f1c))
* update deps ([5d67a1c](https://github.com/hugomrdias/playwright-test/commit/5d67a1cf8fbb37e6c76c9f620764e9eee957c38a))

## [12.1.1](https://github.com/hugomrdias/playwright-test/compare/v12.1.0...v12.1.1) (2023-07-14)


### Bug Fixes

* add wasm loader to node mode ([f71280d](https://github.com/hugomrdias/playwright-test/commit/f71280d44acdb3c1ae756e17129dd610464f6f46))

## [12.1.0](https://github.com/hugomrdias/playwright-test/compare/v12.0.0...v12.1.0) (2023-07-14)


### Features

* add support for wasm loader ([f223465](https://github.com/hugomrdias/playwright-test/commit/f223465d893d1ba339af927d3beed7ace3344e97))
* update playwright to 1.36.0 ([a59e0a4](https://github.com/hugomrdias/playwright-test/commit/a59e0a4474c1ed491f9f76681d05233f22f6f272))

## [12.0.0](https://github.com/hugomrdias/playwright-test/compare/v11.0.4...v12.0.0) (2023-07-14)


### ⚠ BREAKING CHANGES

* process.stdout/stderr without console.log ([#563](https://github.com/hugomrdias/playwright-test/issues/563))

### Features

* process.stdout/stderr without console.log ([#563](https://github.com/hugomrdias/playwright-test/issues/563)) ([2f5baf0](https://github.com/hugomrdias/playwright-test/commit/2f5baf01254dad6e01845a6f6ba1c964117b8764))

## [11.0.4](https://github.com/hugomrdias/playwright-test/compare/v11.0.3...v11.0.4) (2023-07-13)


### Bug Fixes

* support ts in autodetect ([2d8ea1e](https://github.com/hugomrdias/playwright-test/commit/2d8ea1eeb6fc32c2d8a95bec4545e964a2f29517))

## [11.0.3](https://github.com/hugomrdias/playwright-test/compare/v11.0.2...v11.0.3) (2023-07-07)


### Bug Fixes

* auto detect logic for requires ([88638bd](https://github.com/hugomrdias/playwright-test/commit/88638bdab3481a592086cf4c0163027890bc0f54))
* runner/module resolution logic ([#562](https://github.com/hugomrdias/playwright-test/issues/562)) ([a0c5be5](https://github.com/hugomrdias/playwright-test/commit/a0c5be5d32fa9ca70b845c45dbe3b5eb59eb328a))

## [11.0.2](https://github.com/hugomrdias/playwright-test/compare/v11.0.1...v11.0.2) (2023-07-04)


### Bug Fixes

* fix dependencies ([ed11fd2](https://github.com/hugomrdias/playwright-test/commit/ed11fd263bc7322979d5d2ed37980728668489ec))

## [11.0.1](https://github.com/hugomrdias/playwright-test/compare/v11.0.0...v11.0.1) (2023-06-30)


### Bug Fixes

* add missing dep execa ([51b4487](https://github.com/hugomrdias/playwright-test/commit/51b44876718ffc874702ed5b3bd8904ab757608f))

## [11.0.0](https://github.com/hugomrdias/playwright-test/compare/v10.0.1...v11.0.0) (2023-06-30)


### ⚠ BREAKING CHANGES

* Add support for node, internal runner autodetect, path module ids and taps.

### Features

* Add support for node, internal runner autodetect, path module ids and taps. ([1d73a36](https://github.com/hugomrdias/playwright-test/commit/1d73a36723048c850eb387f41b20d33c4e559826))


### Bug Fixes

* fix windows paths ([#555](https://github.com/hugomrdias/playwright-test/issues/555)) ([18639f4](https://github.com/hugomrdias/playwright-test/commit/18639f4b76acb7db04da92d149f2cc5736ca356a))

## [10.0.1](https://github.com/hugomrdias/playwright-test/compare/v10.0.0...v10.0.1) (2023-06-29)


### Bug Fixes

* more colors and experiental runner and autodetect ([477ec99](https://github.com/hugomrdias/playwright-test/commit/477ec995b26075389f61ba1d1d04d1d6d5ec2ede))

## [10.0.0](https://github.com/hugomrdias/playwright-test/compare/v9.2.0...v10.0.0) (2023-06-27)


### ⚠ BREAKING CHANGES

* add support for custom test runners https://github.com/hugomrdias/playwright-test#custom-test-runner

### Features

* add support for custom test runners https://github.com/hugomrdias/playwright-test#custom-test-runner ([f5fb924](https://github.com/hugomrdias/playwright-test/commit/f5fb9246e50c003aa3d8f16d871e9fe9258cd0f6))


### Bug Fixes

* add import.meta.env support ([8073767](https://github.com/hugomrdias/playwright-test/commit/80737675922b3159b39e269431d8381eb2253076)), closes [#549](https://github.com/hugomrdias/playwright-test/issues/549)
* update multiple deps ([1847dc9](https://github.com/hugomrdias/playwright-test/commit/1847dc9d8ebbe8df20f6e411af4f763d658e606c))


### Miscellaneous Chores

* release 10.0.0 ([e4b288d](https://github.com/hugomrdias/playwright-test/commit/e4b288d42fada596650a89288201fdda1cb68c62))

## [9.2.0](https://www.github.com/hugomrdias/playwright-test/compare/v9.1.0...v9.2.0) (2023-06-15)


### Miscellaneous Chores

* release 9.2.0 ([2c72d0d](https://www.github.com/hugomrdias/playwright-test/commit/2c72d0dda0307d2001460b7cdf48562ea457c12f))

## [9.1.0](https://www.github.com/hugomrdias/playwright-test/compare/v9.0.0...v9.1.0) (2023-05-12)


### Features

* add process.exit ([#542](https://www.github.com/hugomrdias/playwright-test/issues/542)) ([2685431](https://www.github.com/hugomrdias/playwright-test/commit/268543178e105ac027b20f5156ca6d2bb9f07dd9))

## [9.0.0](https://www.github.com/hugomrdias/playwright-test/compare/v8.4.0...v9.0.0) (2023-04-28)


### ⚠ BREAKING CHANGES

* tests now run as ESM modules

### Features

* 'none' runner ([d205423](https://www.github.com/hugomrdias/playwright-test/commit/d2054238b6ecc74117676a7b1a0a4f4eebc929a7))
* tests now run as ESM modules ([e7bde86](https://www.github.com/hugomrdias/playwright-test/commit/e7bde86b161f950d9fc1587ad2feb50683df790f))


### Bug Fixes

* add exit code 1 on cli error ([f2f5fbb](https://www.github.com/hugomrdias/playwright-test/commit/f2f5fbb4bc37a66fa2d934bcc59ae26620106438))
* esm sw test ([c7873a6](https://www.github.com/hugomrdias/playwright-test/commit/c7873a685440fc60df37ad564da1e949e2245d64))
* fix load esm config on windows ([527dcda](https://www.github.com/hugomrdias/playwright-test/commit/527dcda9a37277fc65caff32574073a0aee464d1))

## [8.4.0](https://www.github.com/hugomrdias/playwright-test/compare/v8.3.0...v8.4.0) (2023-04-28)


### Features

* extensions use the new headless mode ([9d33a74](https://www.github.com/hugomrdias/playwright-test/commit/9d33a74402370f50c700a9a7abf8698bf9718e7d))
* update deps ([afc261c](https://www.github.com/hugomrdias/playwright-test/commit/afc261cabe5a43a5107916018c989ba0da713c79))


### Bug Fixes

* only install deps not browser in ci linux ([db46d19](https://www.github.com/hugomrdias/playwright-test/commit/db46d1947fa473a2a7c9fb8a3439a311f0df2b4c))

## [8.3.0](https://www.github.com/hugomrdias/playwright-test/compare/v8.2.0...v8.3.0) (2023-04-06)


### Features

* upgrade deps ([10fc905](https://www.github.com/hugomrdias/playwright-test/commit/10fc9059400798c7df84b856d12de6e3b478ffb7))

## [8.2.0](https://www.github.com/hugomrdias/playwright-test/compare/v8.1.2...v8.2.0) (2023-01-27)


### Features

* add BrowserContextOptions ([#526](https://www.github.com/hugomrdias/playwright-test/issues/526)) ([5392d4d](https://www.github.com/hugomrdias/playwright-test/commit/5392d4dd5db52c324918a9318dbeb935ae9be17e))

### [8.1.2](https://www.github.com/hugomrdias/playwright-test/compare/v8.1.1...v8.1.2) (2022-12-12)


### Bug Fixes

* **deps:** bump v8-to-istanbul from 9.0.0 to 9.0.1 ([#460](https://www.github.com/hugomrdias/playwright-test/issues/460)) ([6862c78](https://www.github.com/hugomrdias/playwright-test/commit/6862c78dd87406f5b7e5098de599509459fc94b1))

### [8.1.1](https://www.github.com/hugomrdias/playwright-test/compare/v8.1.0...v8.1.1) (2022-06-16)


### Bug Fixes

* move default to defaults ([#453](https://www.github.com/hugomrdias/playwright-test/issues/453)) ([0334717](https://www.github.com/hugomrdias/playwright-test/commit/0334717d585e874779c8582d6e3fbdbd0ef0b987))

## [8.1.0](https://www.github.com/hugomrdias/playwright-test/compare/v8.0.0...v8.1.0) (2022-06-16)


### Features

* allow overriding coverage dir ([#451](https://www.github.com/hugomrdias/playwright-test/issues/451)) ([422fff1](https://www.github.com/hugomrdias/playwright-test/commit/422fff1ea0f6a322f208146d75235a76eb0e7ef3))

## [8.0.0](https://www.github.com/hugomrdias/playwright-test/compare/v7.4.1...v8.0.0) (2022-05-16)


### ⚠ BREAKING CHANGES

* update mocha, playwright and others, fix sourcemaps (#435)

### Features

* update mocha, playwright and others, fix sourcemaps ([#435](https://www.github.com/hugomrdias/playwright-test/issues/435)) ([b6852a4](https://www.github.com/hugomrdias/playwright-test/commit/b6852a4fcc80d87468ffbe61510fb262b30f0257))

### [7.4.1](https://www.github.com/hugomrdias/playwright-test/compare/v7.4.0...v7.4.1) (2022-05-16)


### Bug Fixes

* try to remove any races between copy and server start ([67be737](https://www.github.com/hugomrdias/playwright-test/commit/67be737b98451f7798934b734067de1804fa514a))

## [7.4.0](https://www.github.com/hugomrdias/playwright-test/compare/v7.3.0...v7.4.0) (2022-04-06)


### Features

* support ESM config files ([#414](https://www.github.com/hugomrdias/playwright-test/issues/414)) ([3f731c8](https://www.github.com/hugomrdias/playwright-test/commit/3f731c85ac75b6cc8cfca935caa2c64389c383c0)), closes [#413](https://www.github.com/hugomrdias/playwright-test/issues/413)

## [7.3.0](https://www.github.com/hugomrdias/playwright-test/compare/v7.2.2...v7.3.0) (2022-03-19)


### Features

* update zora, pw and others ([0bbf67e](https://www.github.com/hugomrdias/playwright-test/commit/0bbf67e62018c8b18527e55c25f9f0c43b2c4fdc))

### [7.2.2](https://www.github.com/hugomrdias/playwright-test/compare/v7.2.1...v7.2.2) (2021-11-16)


### Bug Fixes

* fix cov/sourcemaps paths ([#337](https://www.github.com/hugomrdias/playwright-test/issues/337)) ([a13498c](https://www.github.com/hugomrdias/playwright-test/commit/a13498c75e6d272305d96023c9ff8fe0cda2beed))
* fix the sourmaps paths ([9fae424](https://www.github.com/hugomrdias/playwright-test/commit/9fae424e6ed78f59b10a8a48a4a20b94f8cdc1c6))

### [7.2.1](https://www.github.com/hugomrdias/playwright-test/compare/v7.2.0...v7.2.1) (2021-11-11)


### Bug Fixes

* fix package exports field ([#333](https://www.github.com/hugomrdias/playwright-test/issues/333)) ([6599b8b](https://www.github.com/hugomrdias/playwright-test/commit/6599b8b15bd94da30b617077cda4b0e32b0dcf4f))

## [7.2.0](https://www.github.com/hugomrdias/playwright-test/compare/v7.1.2...v7.2.0) (2021-10-31)


### Features

* update to playwright 1.16 ([#328](https://www.github.com/hugomrdias/playwright-test/issues/328)) ([e14ee17](https://www.github.com/hugomrdias/playwright-test/commit/e14ee17539162c2a93c864215f4474279f0e1a04))


### Bug Fixes

* pass original paths to esbuild ([#320](https://www.github.com/hugomrdias/playwright-test/issues/320)) ([e7f7a81](https://www.github.com/hugomrdias/playwright-test/commit/e7f7a810bc977ffe8027b0db124453b6f93c1314))

### [7.1.2](https://www.github.com/hugomrdias/playwright-test/compare/v7.1.1...v7.1.2) (2021-10-29)


### Bug Fixes

* make after hook always run ([9e45644](https://www.github.com/hugomrdias/playwright-test/commit/9e45644139be680c3b0587e7cf218632eada4651))

### [7.1.1](https://www.github.com/hugomrdias/playwright-test/compare/v7.1.0...v7.1.1) (2021-10-20)


### Bug Fixes

* fix missing util for mocha ([#317](https://www.github.com/hugomrdias/playwright-test/issues/317)) ([cd6d140](https://www.github.com/hugomrdias/playwright-test/commit/cd6d140682b3233f1445a2529a81b8c3e31e7ba7))

## [7.1.0](https://www.github.com/hugomrdias/playwright-test/compare/v7.0.4...v7.1.0) (2021-09-09)


### Features

* add before and after hooks ([92d6b9e](https://www.github.com/hugomrdias/playwright-test/commit/92d6b9ebc4ea49b6a6facf05bc0a7ae5c938d516))
* upgrade esbuild ([617fc66](https://www.github.com/hugomrdias/playwright-test/commit/617fc6695b92432aaf31d0ceeedeb7921d5c8ec1))

### [7.0.4](https://www.github.com/hugomrdias/playwright-test/compare/v7.0.3...v7.0.4) (2021-09-06)


### Bug Fixes

* coverage entry paths ([#288](https://www.github.com/hugomrdias/playwright-test/issues/288)) ([74e0449](https://www.github.com/hugomrdias/playwright-test/commit/74e04490b2bedb78270a75bf59d4a4ee37ef863f))

### [7.0.3](https://www.github.com/hugomrdias/playwright-test/compare/v7.0.2...v7.0.3) (2021-08-19)


### Bug Fixes

* **deps:** bump esbuild from 0.12.15 to 0.12.21 ([#279](https://www.github.com/hugomrdias/playwright-test/issues/279)) ([5d1a824](https://www.github.com/hugomrdias/playwright-test/commit/5d1a824176a16dcd7388a216426a612450251da6))

### [7.0.2](https://www.github.com/hugomrdias/playwright-test/compare/v7.0.1...v7.0.2) (2021-07-15)


### Bug Fixes

* use random high port ([#260](https://www.github.com/hugomrdias/playwright-test/issues/260)) ([12ee535](https://www.github.com/hugomrdias/playwright-test/commit/12ee53588fad80c0bd19cf507f8670300068593e))

### [7.0.1](https://www.github.com/hugomrdias/playwright-test/compare/v7.0.0...v7.0.1) (2021-07-13)


### Bug Fixes

* unregister sw in the proper spot ([6650f17](https://www.github.com/hugomrdias/playwright-test/commit/6650f1789d23ce9a27a1b8ec91528194f8315705))

## [7.0.0](https://www.github.com/hugomrdias/playwright-test/compare/v6.0.0...v7.0.0) (2021-07-13)


### ⚠ BREAKING CHANGES

* shouldn't break anything but a lot changed internally so to be same review your tests!

### Features

* new watcher and better sw ([fbfd613](https://www.github.com/hugomrdias/playwright-test/commit/fbfd61319a384d4deade5f7fdca5341b890eeaf6))


### Bug Fixes

* cli version read and catch cli action errors ([db3709c](https://www.github.com/hugomrdias/playwright-test/commit/db3709ca4c61b1d9d4be24fc605c075af37e84ea))
* remove debug output from internal tools ([7f08409](https://www.github.com/hugomrdias/playwright-test/commit/7f084092dbab7fc47622a26636a9903cfff72622))

## [6.0.0](https://www.github.com/hugomrdias/playwright-test/compare/v5.0.0...v6.0.0) (2021-07-07)


### ⚠ BREAKING CHANGES

* service worker is registered after the tests bundle is requested

### Features

* update deps and improve sw ([#254](https://www.github.com/hugomrdias/playwright-test/issues/254)) ([5c8288a](https://www.github.com/hugomrdias/playwright-test/commit/5c8288ac6bd14e4d3e7cd59cb0898bef838feeff))

## [5.0.0](https://www.github.com/hugomrdias/playwright-test/compare/v4.1.0...v5.0.0) (2021-05-17)


### ⚠ BREAKING CHANGES

* move to esm (#216)

### Features

* move to esm ([#216](https://www.github.com/hugomrdias/playwright-test/issues/216)) ([20bd6bd](https://www.github.com/hugomrdias/playwright-test/commit/20bd6bdba579991393ec4b044f696514d4bd7118))

## [4.1.0](https://www.github.com/hugomrdias/playwright-test/compare/v4.0.0...v4.1.0) (2021-05-13)


### Features

* experimental sw support ([#211](https://www.github.com/hugomrdias/playwright-test/issues/211)) ([ba0a469](https://www.github.com/hugomrdias/playwright-test/commit/ba0a4695e4519a582d414ee8b97a8bb929279487))

## [4.0.0](https://www.github.com/hugomrdias/playwright-test/compare/v3.0.8...v4.0.0) (2021-05-12)


### ⚠ BREAKING CHANGES

* esbuild 0.11.20 and pw 1.11.0

### Features

* update pw and esbuild ([bbc5268](https://www.github.com/hugomrdias/playwright-test/commit/bbc5268eca56d4a0aa75f05afde5b77d4a880114))


### Bug Fixes

* for major ([556f54e](https://www.github.com/hugomrdias/playwright-test/commit/556f54e38552089672689b66c845e6f23a4372cf))

### [3.0.8](https://www.github.com/hugomrdias/playwright-test/compare/v3.0.7...v3.0.8) (2021-05-12)


### Bug Fixes

* fix race in uvu runner ([#205](https://www.github.com/hugomrdias/playwright-test/issues/205)) ([a01f815](https://www.github.com/hugomrdias/playwright-test/commit/a01f815cb83a8e47ba3f80c62a33ef9f00508bae))
* use tape instead of fresh-tape ([#206](https://www.github.com/hugomrdias/playwright-test/issues/206)) ([713b264](https://www.github.com/hugomrdias/playwright-test/commit/713b264c722aa2bd931f32f1457450898a13cda0))

### [3.0.7](https://www.github.com/hugomrdias/playwright-test/compare/v3.0.6...v3.0.7) (2021-04-27)


### Bug Fixes

* pin esbuild version again ([#194](https://www.github.com/hugomrdias/playwright-test/issues/194)) ([9f3ece7](https://www.github.com/hugomrdias/playwright-test/commit/9f3ece77bc50c346d200b3801619124a9993a9ce))

### [3.0.6](https://www.github.com/hugomrdias/playwright-test/compare/v3.0.5...v3.0.6) (2021-04-27)


### Bug Fixes

* revert esbuild downgrade ([#192](https://www.github.com/hugomrdias/playwright-test/issues/192)) ([0e8191a](https://www.github.com/hugomrdias/playwright-test/commit/0e8191a319a9ccbccb9df591dfcc4ffbe35dd729))

### [3.0.5](https://www.github.com/hugomrdias/playwright-test/compare/v3.0.4...v3.0.5) (2021-04-26)


### Bug Fixes

* pin esbuild ([75ee929](https://www.github.com/hugomrdias/playwright-test/commit/75ee929e986121c20b1b5ddc9c467c7d67ac56a7))

### [3.0.4](https://www.github.com/hugomrdias/playwright-test/compare/v3.0.3...v3.0.4) (2021-04-08)


### Bug Fixes

* print out the name of the browser during setup ([#178](https://www.github.com/hugomrdias/playwright-test/issues/178)) ([5393493](https://www.github.com/hugomrdias/playwright-test/commit/53934934d6514ae08907b5410910ed886e21a537))
* wait for runner to me in the global scope inside workers ([7de86a4](https://www.github.com/hugomrdias/playwright-test/commit/7de86a4d0aa0b6961b2adfb90608425aaca5bc5d))

### [3.0.3](https://www.github.com/hugomrdias/playwright-test/compare/v3.0.2...v3.0.3) (2021-04-08)


### Bug Fixes

* **deps:** bump esbuild from 0.11.5 to 0.11.6 ([#176](https://www.github.com/hugomrdias/playwright-test/issues/176)) ([46bf3f2](https://www.github.com/hugomrdias/playwright-test/commit/46bf3f24ef292e78027a6e3b1c3fa022a3a6c632))

### [3.0.2](https://www.github.com/hugomrdias/playwright-test/compare/v3.0.1...v3.0.2) (2021-04-07)


### Bug Fixes

* dont wait for worker because we will wait for the event after ([d62c005](https://www.github.com/hugomrdias/playwright-test/commit/d62c005af4a38e233995e2204f085c3647917994))

### [3.0.1](https://www.github.com/hugomrdias/playwright-test/compare/v3.0.0...v3.0.1) (2021-04-07)


### Bug Fixes

* do not delete tmp browser dir to avoid race ([b56b11c](https://www.github.com/hugomrdias/playwright-test/commit/b56b11ca7531cc586400c8e8306679911cc23e63))

## [3.0.0](https://www.github.com/hugomrdias/playwright-test/compare/v2.1.0...v3.0.0) (2021-04-06)


### ⚠ BREAKING CHANGES

* too many changes and esbuild updated

### Bug Fixes

* fix extensions, cov,formating, types, errors and workers ([#168](https://www.github.com/hugomrdias/playwright-test/issues/168)) ([9593c3d](https://www.github.com/hugomrdias/playwright-test/commit/9593c3d17a11ce7b0a6430d546d008f69c86b545))
* move fresh-tape to deps and fix cov ([#173](https://www.github.com/hugomrdias/playwright-test/issues/173)) ([30cd1dc](https://www.github.com/hugomrdias/playwright-test/commit/30cd1dcecb405c1362d264b8b6f4705e618bc029))
