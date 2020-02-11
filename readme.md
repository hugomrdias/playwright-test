# puppetter-test [![NPM Version](https://img.shields.io/npm/v/puppetter-test.svg)](https://www.npmjs.com/package/puppetter-test) [![NPM Downloads](https://img.shields.io/npm/dt/puppetter-test.svg)](https://www.npmjs.com/package/puppetter-test) [![NPM License](https://img.shields.io/npm/l/puppetter-test.svg)](https://www.npmjs.com/package/puppetter-test) [![Build Status](https://travis-ci.org/hugomrdias/puppetter-test.svg?branch=master)](https://travis-ci.org/hugomrdias/puppetter-test)

> My smashing module


## Install

```
$ npm install puppetter-test
```


## Usage

```js
const puppetterTest = require('puppetter-test');

puppetterTest('unicorns');
//=> 'unicorns & rainbows'
```


## API

### puppetterTest(input, [options])

#### input

Type: `string`

Lorem ipsum.

#### options

##### foo

Type: `boolean`<br>
Default: `false`

Lorem ipsum.


## CLI

```
$ npm install --global puppetter-test
```

```
$ puppetter-test --help

  Usage
    puppetter-test [input]

  Options
    --foo  Lorem ipsum [Default: false]

  Examples
    $ puppetter-test
    unicorns & rainbows
    $ puppetter-test ponies
    ponies & rainbows
```


## License

MIT © [Hugo Dias](http://hugodias.me)
