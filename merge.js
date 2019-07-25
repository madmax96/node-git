
// Merge module
// ------------

const Files = require('./files');
const Config = require('./config');
const Diff = require('./diff');
const Refs = require('./refs');
const Objects = require('./objects');
const WorkingCopy = require('./workingCopy');
const Index = require('./index');

const Merge = {

  // **commonAncestor()** returns the hash of the commit that is the
  // most recent common ancestor of `aHash` and `bHash`.
  commonAncestor(aHash, bHash) {
    const sorted = [aHash, bHash].sort();
    aHash = sorted[0];
    bHash = sorted[1];
    const aAncestors = [aHash].concat(Objects.ancestors(aHash));
    const bAncestors = [bHash].concat(Objects.ancestors(bHash));
    return util.intersection(aAncestors, bAncestors)[0];
  },

  // **isMergeInProgress()** returns true if the repository is in the
  // middle of a Merge.
  isMergeInProgress() {
    return Refs.hash('MERGE_HEAD');
  },

  // **canFastForward()** A fast forward is possible if the changes
  // made to get to the `giverHash` commit already incorporate the
  // changes made to get to the `receiverHash` commit.  So,
  // `canFastForward()` returns true if the `receiverHash` commit is
  // an ancestor of the `giverHash` commit.  It also returns true if
  // there is no `receiverHash` commit because this indicates the
  // repository has no commits, yet.
  canFastForward(receiverHash, giverHash) {
    return receiverHash === undefined || Objects.isAncestor(giverHash, receiverHash);
  },

  // **isAForceFetch()** returns true if hash for local commit
  // (`receiverHash`) is not ancestor of hash for fetched commit
  // (`giverHash`).
  isAForceFetch(receiverHash, giverHash) {
    return receiverHash !== undefined && !Objects.isAncestor(giverHash, receiverHash);
  },

  // **hasConflicts()** returns true if merging the commit for
  // `giverHash` into the commit for `receiverHash` would produce
  // conflicts.
  hasConflicts(receiverHash, giverHash) {
    const mergeDiff = Merge.mergeDiff(receiverHash, giverHash);
    return Object.keys(mergeDiff)
      .filter(p => mergeDiff[p].status === Diff.FILE_STATUS.CONFLICT).length > 0;
  },

  // **mergeDiff()** returns a diff that represents the changes to get
  // from the `receiverHash` commit to the `giverHash` commit.
  // Because this is a merge diff, the function uses the common
  // ancestor of the `receiverHash` commit and `giverHash` commit to
  // avoid trivial conflicts.
  mergeDiff(receiverHash, giverHash) {
    return Diff.tocDiff(Objects.commitToc(receiverHash),
      Objects.commitToc(giverHash),
      Objects.commitToc(Merge.commonAncestor(receiverHash, giverHash)));
  },

  // **writeMergeMsg()** creates a message for the merge commit that
  // will potentially be created when the `giverHash` commit is merged
  // into the `receiverHash` commit.  It writes this message to
  // `.gitlet/MERGE_MSG`.
  writeMergeMsg(receiverHash, giverHash, ref) {
    let msg = `Merge ${ref} into ${Refs.headBranchName()}`;

    const mergeDiff = Merge.mergeDiff(receiverHash, giverHash);
    const conflicts = Object.keys(mergeDiff)
      .filter(p => mergeDiff[p].status === Diff.FILE_STATUS.CONFLICT);
    if (conflicts.length > 0) {
      msg += `\nConflicts:\n${conflicts.join('\n')}`;
    }

    Files.write(Files.gitletPath('MERGE_MSG'), msg);
  },

  // **writeIndex()** merges the `giverHash` commit into the
  // `receiverHash` commit and writes the merged content to the Index.
  writeIndex(receiverHash, giverHash) {
    const mergeDiff = Merge.mergeDiff(receiverHash, giverHash);
    Index.write({});
    Object.keys(mergeDiff).forEach((p) => {
      if (mergeDiff[p].status === Diff.FILE_STATUS.CONFLICT) {
        Index.writeConflict(p,
          Objects.read(mergeDiff[p].receiver),
          Objects.read(mergeDiff[p].giver),
          Objects.read(mergeDiff[p].base));
      } else if (mergeDiff[p].status === Diff.FILE_STATUS.MODIFY) {
        Index.writeNonConflict(p, Objects.read(mergeDiff[p].giver));
      } else if (mergeDiff[p].status === Diff.FILE_STATUS.ADD
                   || mergeDiff[p].status === Diff.FILE_STATUS.SAME) {
        const content = Objects.read(mergeDiff[p].receiver || mergeDiff[p].giver);
        Index.writeNonConflict(p, content);
      }
    });
  },

  // **writeFastForwardMerge()** Fast forwarding means making the
  // current branch reflect the commit that `giverHash` points at.  No
  // new commit is created.
  writeFastForwardMerge(receiverHash, giverHash) {
    // Point head at `giverHash`.
    Refs.write(Refs.toLocalRef(Refs.headBranchName()), giverHash);

    // Make the index mirror the content of `giverHash`.
    Index.write(Index.tocToIndex(Objects.commitToc(giverHash)));

    // If the repo is bare, it has no working copy, so there is no
    // more work to do.  If the repo is not bare...
    if (!Config.isBare()) {
      // ...Get an object that maps from file paths in the
      // `receiverHash` commit to hashes of the files' content.  If
      // `recevierHash` is undefined, the repository has no commits,
      // yet, and the mapping object is empty.
      const receiverToc = receiverHash === undefined ? {} : Objects.commitToc(receiverHash);

      // ...and write the content of the files to the working copy.
      WorkingCopy.write(Diff.tocDiff(receiverToc, Objects.commitToc(giverHash)));
    }
  },

  // **writeNonFastForwardMerge()** A non fast forward merge creates a
  // merge commit to integrate the content of the `receiverHash`
  // commit with the content of the `giverHash` commit.  This
  // integration requires a merge commit because, unlike a fast
  // forward merge, no commit yet exists that embodies the combination
  // of these two commits.  `writeNonFastForwardMerge()` does not
  // actually create the merge commit.  It just sets the wheels in
  // motion.
  writeNonFastForwardMerge(receiverHash, giverHash, giverRef) {
    // Write `giverHash` to `.gitlet/MERGE_HEAD`.  This file acts as a
    // record of `giverHash` and as the signal that the repository is
    // in the merging state.
    Refs.write('MERGE_HEAD', giverHash);

    // Write a standard merge commit message that will be used when
    // the merge commit is created.
    Merge.writeMergeMsg(receiverHash, giverHash, giverRef);

    // Merge the `receiverHash` commit with the `giverHash` commit and
    // write the content to the Index.
    Merge.writeIndex(receiverHash, giverHash);

    // If the repo is bare, it has no working copy, so there is no
    // more work to do.  If the repo is not bare...
    if (!Config.isBare()) {
      // ...merge the `receiverHash` commit with the `giverHash`
      // commit and write the content to the working copy.
      WorkingCopy.write(Merge.mergeDiff(receiverHash, giverHash));
    }
  },
};

module.exports = Merge;
