

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

const diff = {
    FILE_STATUS: { ADD: "A", MODIFY: "M", DELETE: "D", SAME: "SAME", CONFLICT: "CONFLICT" },

    // **diff()** returns a diff object (see above for the format of a
    // diff object).  If `hash1` is passed, it is used as the first
    // version in the diff.  If it is not passed, the index is used.  If
    // `hash2` is passed, it is used as the second version in the diff.
    // If it is not passed, the working copy is used.
    diff: function(hash1, hash2) {
      let a = hash1 === undefined ? index.toc() : objects.commitToc(hash1);
      let b = hash2 === undefined ? index.workingCopyToc() : objects.commitToc(hash2);
      return diff.tocDiff(a, b);
    },

    // **nameStatus()** takes a diff and returns a JS object that maps
    // from file paths to file statuses.
    nameStatus: function(dif) {
      return Object.keys(dif)
        .filter(function(p) { return dif[p].status !== diff.FILE_STATUS.SAME; })
        .reduce(function(ns, p) { return util.setIn(ns, [p, dif[p].status]); }, {});
    },

    // **tocDiff()** takes three JS objects that map file paths to
    // hashes of file content.  It returns a diff between `receiver` and
    // `giver` (see the module description for the format).  `base` is
    // the version that is the most recent commen ancestor of the
    // `receiver` and `giver`.  If `base` is not passed, `receiver` is
    // used as the base.  The base is only passed when getting the diff
    // for a merge.  This is the only time the conflict status might be
    // used.
    tocDiff: function(receiver, giver, base) {

      // fileStatus() takes three strings that represent different
      // versions of the content of a file.  It returns the change that
      // needs to be made to get from the `receiver` to the `giver`.
      function fileStatus(receiver, giver, base) {
        let receiverPresent = receiver !== undefined;
        let basePresent = base !== undefined;
        let giverPresent = giver !== undefined;
        if (receiverPresent && giverPresent && receiver !== giver) {
          if (receiver !== base && giver !== base) {
            return diff.FILE_STATUS.CONFLICT;
          } else {
            return diff.FILE_STATUS.MODIFY;
          }
        } else if (receiver === giver) {
          return diff.FILE_STATUS.SAME;
        } else if ((!receiverPresent && !basePresent && giverPresent) ||
                   (receiverPresent && !basePresent && !giverPresent)) {
          return diff.FILE_STATUS.ADD;
        } else if ((receiverPresent && basePresent && !giverPresent) ||
                   (!receiverPresent && basePresent && giverPresent)) {
          return diff.FILE_STATUS.DELETE;
        }
      };

      // If `base` was not passed, use `receiver` as the base.
      base = base || receiver;

      // Get an array of all the paths in all the versions.
      let paths = Object.keys(receiver).concat(Object.keys(base)).concat(Object.keys(giver));

      // Create and return diff.
      return util.unique(paths).reduce(function(idx, p) {
        return util.setIn(idx, [p, {
          status: fileStatus(receiver[p], giver[p], base[p]),
          receiver: receiver[p],
          base: base[p],
          giver: giver[p]
        }]);
      }, {});
    },

    // **changedFilesCommitWouldOverwrite()** gets a list of files
    // changed in the working copy.  It gets a list of the files that
    // are different in the head commit and the commit for the passed
    // hash.  It returns a list of paths that appear in both lists.
    changedFilesCommitWouldOverwrite: function(hash) {
      let headHash = refs.hash("HEAD");
      return util.intersection(Object.keys(diff.nameStatus(diff.diff(headHash))),
                               Object.keys(diff.nameStatus(diff.diff(headHash, hash))));
    },

    // **addedOrModifiedFiles()** returns a list of files that have been
    // added to or modified in the working copy since the last commit.
    addedOrModifiedFiles: function() {
      let headToc = refs.hash("HEAD") ? objects.commitToc(refs.hash("HEAD")) : {};
      let wc = diff.nameStatus(diff.tocDiff(headToc, index.workingCopyToc()));
      return Object.keys(wc).filter(function(p) { return wc[p] !== diff.FILE_STATUS.DELETE; });
    }
  };

  module.exports = diff;
