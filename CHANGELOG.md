# Changelog

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
