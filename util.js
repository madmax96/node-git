
// Util module
// -----------

// A set of handy functions.

const util = {

  // **isString()** returns true if `thing` is a string.
  isString(thing) {
    return typeof thing === 'string';
  },

  // **hash()** returns a hash of `string`.
  hash(string) {
    let hashInt = 0;
    for (let i = 0; i < string.length; i++) {
      hashInt = hashInt * 31 + string.charCodeAt(i);
      hashInt |= 0;
    }

    return Math.abs(hashInt).toString(16);
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
      util.setIn(obj[arr[0]], arr.slice(1));
    }

    return obj;
  },

  // **lines()** takes a string, splits on newlines and returns an
  // array of the lines that are not empty.
  lines(str) {
    return str.split('\n').filter(l => l !== '');
  },

  // **flatten()** returns a flattened version of `arr`.
  flatten(arr) {
    return arr.reduce((a, e) => a.concat(e instanceof Array ? util.flatten(e) : e), []);
  },

  // **unique()** returns the unique elements in `arr`.
  unique(arr) {
    return arr.reduce((a, p) => (a.indexOf(p) === -1 ? a.concat(p) : a), []);
  },

  // **intersection()** takes two arrays `a` and `b`.  It returns an
  // array of the items that appear in both.
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
module.exports = util;
