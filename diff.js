

// Diff module
// -----------

// Produces diffs between versions of the repository content.  Diffs
// are represented as JS objects that map file paths to objects that
// indicate the change required to get from the first version of the
// file (the receiver) to the second (the giver).  eg:
// <pre>{
//   file1: {
//     status: "A",
//     receiver: undefined,
//     base: undefined,
//     giver: hash(1)
//   },
//   file2: {
//     status: "C",
//     receiver: hash(b),
//     base: hash(a),
//     giver: hash(c)
//   }
// }</pre>

const Refs = require('./refs');
const Objects = require('./objects');
const Util = require('./util');
const Index = require('./index');

const Diff = {
  FILE_STATUS: {
    ADD: 'A', MODIFY: 'M', DELETE: 'D', SAME: 'SAME', CONFLICT: 'CONFLICT',
  },

  // **diff()** returns a diff object (see above for the format of a
  // diff object).  If `hash1` is passed, it is used as the first
  // version in the Diff.  If it is not passed, the index is used.  If
  // `hash2` is passed, it is used as the second version in the Diff.
  // If it is not passed, the working copy is used.
  diff(hash1, hash2) {
    const a = hash1 === undefined ? Index.toc() : Objects.commitToc(hash1);
    const b = hash2 === undefined ? Index.workingCopyToc() : Objects.commitToc(hash2);
    return Diff.tocDiff(a, b);
  },

  // **nameStatus()** takes a diff and returns a JS object that maps
  // from file paths to file statuses.
  nameStatus(dif) {
    return Object.keys(dif)
      .filter(p => dif[p].status !== Diff.FILE_STATUS.SAME)
      .reduce((ns, p) => Util.setIn(ns, [p, dif[p].status]), {});
  },

  // **tocDiff()** takes three JS objects that map file paths to
  // hashes of file content.  It returns a diff between `receiver` and
  // `giver` (see the module description for the format).  `base` is
  // the version that is the most recent commen ancestor of the
  // `receiver` and `giver`.  If `base` is not passed, `receiver` is
  // used as the base.  The base is only passed when getting the diff
  // for a merge.  This is the only time the conflict status might be
  // used.
  tocDiff(receiver, giver, base) {
    // fileStatus() takes three strings that represent different
    // versions of the content of a file.  It returns the change that
    // needs to be made to get from the `receiver` to the `giver`.
    function fileStatus(receiver, giver, base) {
      const receiverPresent = receiver !== undefined;
      const basePresent = base !== undefined;
      const giverPresent = giver !== undefined;
      if (receiverPresent && giverPresent && receiver !== giver) {
        if (receiver !== base && giver !== base) {
          return Diff.FILE_STATUS.CONFLICT;
        }
        return Diff.FILE_STATUS.MODIFY;
      } if (receiver === giver) {
        return Diff.FILE_STATUS.SAME;
      } if ((!receiverPresent && !basePresent && giverPresent)
                   || (receiverPresent && !basePresent && !giverPresent)) {
        return Diff.FILE_STATUS.ADD;
      } if ((receiverPresent && basePresent && !giverPresent)
                   || (!receiverPresent && basePresent && giverPresent)) {
        return Diff.FILE_STATUS.DELETE;
      }
    }

    // If `base` was not passed, use `receiver` as the base.
    base = base || receiver;

    // Get an array of all the paths in all the versions.
    const paths = Object.keys(receiver).concat(Object.keys(base)).concat(Object.keys(giver));

    // Create and return Diff.
    return Util.unique(paths).reduce((idx, p) => Util.setIn(idx, [p, {
      status: fileStatus(receiver[p], giver[p], base[p]),
      receiver: receiver[p],
      base: base[p],
      giver: giver[p],
    }]), {});
  },

  // **changedFilesCommitWouldOverwrite()** gets a list of files
  // changed in the working copy.  It gets a list of the files that
  // are different in the head commit and the commit for the passed
  // hash.  It returns a list of paths that appear in both lists.
  changedFilesCommitWouldOverwrite(hash) {
    const headHash = Refs.hash('HEAD');
    return Util.intersection(Object.keys(Diff.nameStatus(Diff.diff(headHash))),
      Object.keys(Diff.nameStatus(Diff.diff(headHash, hash))));
  },

  // **addedOrModifiedFiles()** returns a list of files that have been
  // added to or modified in the working copy since the last commit.
  addedOrModifiedFiles() {
    const headToc = Refs.hash('HEAD') ? Objects.commitToc(Refs.hash('HEAD')) : {};
    const wc = Diff.nameStatus(Diff.tocDiff(headToc, Index.workingCopyToc()));
    return Object.keys(wc).filter(p => wc[p] !== Diff.FILE_STATUS.DELETE);
  },
};

module.exports = Diff;
