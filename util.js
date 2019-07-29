
// Util module
// -----------

// A set of handy functions.
const crypto = require('crypto');

const Util = {

  // **isString()** returns true if `value` is a string.
  isString(value) {
    return typeof value === 'string';
  },

  /**
   * @param {string} string
   * @returns {string} returns a hash of `string`.
   */
  hash(string) {
    return crypto.createHash('md5').update(string).digest('hex');
  },

  // **setIn()** takes an array that contains 1 or more keys and has
  // one value at the end.  It drills down into `obj` using the keys
  // and sets the value as the value of the last key.  eg<br/>
  // `setIn({}, ["a", "b", "me"]); // => { a: { b: "me" } }`
  setIn(obj, arr) {
    if (arr.length === 2) {
      obj[arr[0]] = arr[1];
    } else if (arr.length > 2) {
      obj[arr[0]] = obj[arr[0]] || {};
      Util.setIn(obj[arr[0]], arr.slice(1));
    }

    return obj;
  },

  /**
   * @param {string} string
   * @returns {string[]} takes a string, splits on newlines and returns an
     array of the lines that are not empty.
   */
  lines(str) {
    return str.split('\n').filter(l => l !== '');
  },

  // **flatten()** returns a flattened version of `arr`.
  flatten(arr) {
    return arr.reduce((a, e) => a.concat(e instanceof Array ? Util.flatten(e) : e), []);
  },

  // **unique()** returns the unique elements in `arr`.
  unique(arr) {
    return arr.reduce((a, p) => (a.indexOf(p) === -1 ? a.concat(p) : a), []);
  },


  /**
   * takes two arrays `a` and `b`.It returns an
     array of the items that appear in both.
   * @param {array} a
   * @param {array} b
   * @returns {array}
   */
  intersection(a, b) {
    return a.filter(e => b.indexOf(e) !== -1);
  },

  // **onRemote()** allows execution of a command on a remote
  // repository.  It returns an anonymous function that takes another
  // function `fn`.  When the anonymous function is run, it switches
  // to `remotePath`, executes `fn`, then switches back to the
  // original directory.
  onRemote(remotePath) {
    return (fn) => {
      const originalDir = process.cwd();
      process.chdir(remotePath);
      const result = fn.apply(null, Array.prototype.slice.call(arguments, 1));
      process.chdir(originalDir);
      return result;
    };
  },
};
module.exports = Util;
