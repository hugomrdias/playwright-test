// @ts-nocheck
// Generated from Node.js v24.22.0 `lib/internal/errors.js`, with only the changes needed to run in
// browsers. Copyright Node.js contributors, MIT license.
import { primordials } from './node-primordials.js';
import { registerCodes } from '../polyfills/node-internals.js';
import { format, inspect } from './node-inspect.js';
const {
  ArrayIsArray,
  ArrayPrototypeIncludes,
  ArrayPrototypeIndexOf,
  ArrayPrototypeJoin,
  ArrayPrototypeMap,
  ArrayPrototypePush,
  ArrayPrototypeSlice,
  ArrayPrototypeSplice,
  MathAbs,
  NumberIsInteger,
  RegExpPrototypeExec,
  StringPrototypeEndsWith,
  StringPrototypeIncludes,
  StringPrototypeIndexOf,
  StringPrototypeSlice,
  StringPrototypeToLowerCase,
} = primordials;

const assert = (value, message) => {
  if (!value) throw new Error(message);
};
const lazyInternalUtilInspect = () => ({ format, inspect });
const internalBinding = () => ({ guessHandleType: () => 'unknown' });
const HideStackFramesError = null;

export const codes = {};
const messages = new Map();

function getMessage(key, args, self) {
  const msg = messages.get(key);
  if (typeof msg === 'function') return msg.apply(self, args);
  return args.length === 0 ? msg : format(msg, ...args);
}

// The stack of a node error is built by a V8 hook in Node.js.
function makeNodeErrorWithCode(Base, key) {
  class NodeError extends Base {
    code = key;

    constructor(...args) {
      super();
      Object.defineProperty(this, 'message', {
        __proto__: null,
        value: getMessage(key, args, this),
        enumerable: false,
        writable: true,
        configurable: true,
      });
      Error.captureStackTrace?.(this, NodeError);
      if (typeof this.stack === 'string') {
        this.stack = this.stack.replace(`${this.name}:`, `${this.name} [${key}]:`);
      }
    }

    get ['constructor']() {
      return Base;
    }

    toString() {
      return `${this.name} [${key}]: ${this.message}`;
    }
  }
  return NodeError;
}

function E(sym, val, def) {
  messages.set(sym, val);
  codes[sym] = makeNodeErrorWithCode(def, sym);
}

const classRegExp = /^[A-Z][a-zA-Z0-9]*$/;

const kTypes = [
  'string',
  'function',
  'number',
  'object',
  // Accept 'Function' and 'Object' as alternative to the lower cased version.
  'Function',
  'Object',
  'boolean',
  'bigint',
  'symbol',
];

function addNumericalSeparator(val) {
  let res = '';
  let i = val.length;
  const start = val[0] === '-' ? 1 : 0;
  for (; i >= start + 4; i -= 3) {
    res = `_${StringPrototypeSlice(val, i - 3, i)}${res}`;
  }
  return `${StringPrototypeSlice(val, 0, i)}${res}`;
}

function determineSpecificType(value) {
  if (value === null) {
    return 'null';
  } else if (value === undefined) {
    return 'undefined';
  }

  const type = typeof value;

  switch (type) {
    case 'bigint':
      return `type bigint (${value}n)`;
    case 'number':
      if (value === 0) {
        return 1 / value === -Infinity ? 'type number (-0)' : 'type number (0)';
      } else if (value !== value) { // eslint-disable-line no-self-compare
        return 'type number (NaN)';
      } else if (value === Infinity) {
        return 'type number (Infinity)';
      } else if (value === -Infinity) {
        return 'type number (-Infinity)';
      }
      return `type number (${value})`;
    case 'boolean':
      return value ? 'type boolean (true)' : 'type boolean (false)';
    case 'symbol':
      return `type symbol (${String(value)})`;
    case 'function':
      return `function ${value.name}`;
    case 'object': {
      // `constructor` may be user-controlled: it need not be an object, and
      // its `name` need not be a non-empty string. Reading either can invoke
      // an accessor, so read each one once.
      const name = value.constructor?.name;
      if (typeof name === 'string' && name !== '') {
        return `an instance of ${name}`;
      }
      return `${lazyInternalUtilInspect().inspect(value, { depth: -1 })}`;
    }
    case 'string':
      value.length > 28 && (value = `${StringPrototypeSlice(value, 0, 25)}...`);
      if (StringPrototypeIndexOf(value, "'") === -1) {
        return `type string ('${value}')`;
      }
      return `type string (${JSONStringify(value)})`;
    default:
      value = lazyInternalUtilInspect().inspect(value, { colors: false });
      if (value.length > 28) {
        value = `${StringPrototypeSlice(value, 0, 25)}...`;
      }

      return `type ${type} (${value})`;
  }
}

/**
 * Create a list string in the form like 'A and B' or 'A, B, ..., and Z'.
 * We cannot use Intl.ListFormat because it's not available in
 * --without-intl builds.
 * @param {string[]} array An array of strings.
 * @param {string} [type] The list type to be inserted before the last element.
 * @returns {string}
 */

function formatList(array, type = 'and') {
  switch (array.length) {
    case 0: return '';
    case 1: return `${array[0]}`;
    case 2: return `${array[0]} ${type} ${array[1]}`;
    case 3: return `${array[0]}, ${array[1]}, ${type} ${array[2]}`;
    default:
      return `${ArrayPrototypeJoin(ArrayPrototypeSlice(array, 0, -1), ', ')}, ${type} ${array[array.length - 1]}`;
  }
}

E('ERR_AMBIGUOUS_ARGUMENT', 'The "%s" argument is ambiguous. %s', TypeError);

E('ERR_CONSTRUCT_CALL_REQUIRED', 'Class constructor %s cannot be invoked without `new`', TypeError);

E('ERR_FALSY_VALUE_REJECTION', function(reason) {
  this.reason = reason;
  return 'Promise was rejected with falsy value';
}, Error);

E('ERR_INVALID_ARG_TYPE',
  (name, expected, actual) => {
    assert(typeof name === 'string', "'name' must be a string");
    if (!ArrayIsArray(expected)) {
      expected = [expected];
    }

    let msg = 'The ';
    if (StringPrototypeEndsWith(name, ' argument')) {
      // For cases like 'first argument'
      msg += `${name} `;
    } else {
      const type = StringPrototypeIncludes(name, '.') ? 'property' : 'argument';
      msg += `"${name}" ${type} `;
    }
    msg += 'must be ';

    const types = [];
    const instances = [];
    const other = [];

    for (const value of expected) {
      assert(typeof value === 'string',
             'All expected entries have to be of type string');
      if (ArrayPrototypeIncludes(kTypes, value)) {
        ArrayPrototypePush(types, StringPrototypeToLowerCase(value));
      } else if (RegExpPrototypeExec(classRegExp, value) !== null) {
        ArrayPrototypePush(instances, value);
      } else {
        assert(value !== 'object',
               'The value "object" should be written as "Object"');
        ArrayPrototypePush(other, value);
      }
    }

    // Special handle `object` in case other instances are allowed to outline
    // the differences between each other.
    if (instances.length > 0) {
      const pos = ArrayPrototypeIndexOf(types, 'object');
      if (pos !== -1) {
        ArrayPrototypeSplice(types, pos, 1);
        ArrayPrototypePush(instances, 'Object');
      }
    }

    if (types.length > 0) {
      msg += `${types.length > 1 ? 'one of type' : 'of type'} ${formatList(types, 'or')}`;
      if (instances.length > 0 || other.length > 0)
        msg += ' or ';
    }

    if (instances.length > 0) {
      msg += `an instance of ${formatList(instances, 'or')}`;
      if (other.length > 0)
        msg += ' or ';
    }

    if (other.length > 0) {
      if (other.length > 1) {
        msg += `one of ${formatList(other, 'or')}`;
      } else {
        if (StringPrototypeToLowerCase(other[0]) !== other[0])
          msg += 'an ';
        msg += `${other[0]}`;
      }
    }

    msg += `. Received ${determineSpecificType(actual)}`;

    return msg;
  }, TypeError, HideStackFramesError);

E('ERR_INVALID_ARG_VALUE', (name, value, reason = 'is invalid') => {
  let inspected = lazyInternalUtilInspect().inspect(value);
  if (inspected.length > 128) {
    inspected = `${StringPrototypeSlice(inspected, 0, 128)}...`;
  }
  const type = StringPrototypeIncludes(name, '.') ? 'property' : 'argument';
  return `The ${type} '${name}' ${reason}. Received ${inspected}`;
}, TypeError, RangeError, HideStackFramesError);

E('ERR_INVALID_RETURN_VALUE', (input, name, value) => {
  const type = determineSpecificType(value);

  return `Expected ${input} to be returned from the "${name}"` +
         ` function but got ${type}.`;
}, TypeError, RangeError);

E('ERR_MISSING_ARGS',
  (...args) => {
    assert(args.length > 0, 'At least one arg needs to be specified');
    let msg = 'The ';
    const len = args.length;
    const wrap = (a) => `"${a}"`;
    args = ArrayPrototypeMap(
      args,
      (a) => (ArrayIsArray(a) ?
        ArrayPrototypeJoin(ArrayPrototypeMap(a, wrap), ' or ') :
        wrap(a)),
    );
    msg += `${formatList(args)} argument${len > 1 ? 's' : ''}`;
    return `${msg} must be specified`;
  }, TypeError);

E('ERR_OUT_OF_RANGE',
  (str, range, input, replaceDefaultBoolean = false) => {
    assert(range, 'Missing "range" argument');
    let msg = replaceDefaultBoolean ? str :
      `The value of "${str}" is out of range.`;
    let received;
    if (NumberIsInteger(input) && MathAbs(input) > 2 ** 32) {
      received = addNumericalSeparator(String(input));
    } else if (typeof input === 'bigint') {
      received = String(input);
      if (input > 2n ** 32n || input < -(2n ** 32n)) {
        received = addNumericalSeparator(received);
      }
      received += 'n';
    } else {
      received = lazyInternalUtilInspect().inspect(input);
    }
    msg += ` It must be ${range}. Received ${received}`;
    return msg;
  }, RangeError, HideStackFramesError);

registerCodes(codes);
