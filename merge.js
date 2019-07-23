
// Merge module
// ------------

const merge = {

    // **commonAncestor()** returns the hash of the commit that is the
    // most recent common ancestor of `aHash` and `bHash`.
    commonAncestor: function(aHash, bHash) {
      let sorted = [aHash, bHash].sort();
      aHash = sorted[0];
      bHash = sorted[1];
      let aAncestors = [aHash].concat(objects.ancestors(aHash));
      let bAncestors = [bHash].concat(objects.ancestors(bHash));
      return util.intersection(aAncestors, bAncestors)[0];
    },

    // **isMergeInProgress()** returns true if the repository is in the
    // middle of a merge.
    isMergeInProgress: function() {
      return refs.hash("MERGE_HEAD");
    },

    // **canFastForward()** A fast forward is possible if the changes
    // made to get to the `giverHash` commit already incorporate the
    // changes made to get to the `receiverHash` commit.  So,
    // `canFastForward()` returns true if the `receiverHash` commit is
    // an ancestor of the `giverHash` commit.  It also returns true if
    // there is no `receiverHash` commit because this indicates the
    // repository has no commits, yet.
    canFastForward: function(receiverHash, giverHash) {
      return receiverHash === undefined || objects.isAncestor(giverHash, receiverHash);
    },

    // **isAForceFetch()** returns true if hash for local commit
    // (`receiverHash`) is not ancestor of hash for fetched commit
    // (`giverHash`).
    isAForceFetch: function(receiverHash, giverHash) {
      return receiverHash !== undefined && !objects.isAncestor(giverHash, receiverHash);
    },

    // **hasConflicts()** returns true if merging the commit for
    // `giverHash` into the commit for `receiverHash` would produce
    // conflicts.
    hasConflicts: function(receiverHash, giverHash) {
      let mergeDiff = merge.mergeDiff(receiverHash, giverHash);
      return Object.keys(mergeDiff)
        .filter(function(p){return mergeDiff[p].status===diff.FILE_STATUS.CONFLICT }).length > 0
    },

    // **mergeDiff()** returns a diff that represents the changes to get
    // from the `receiverHash` commit to the `giverHash` commit.
    // Because this is a merge diff, the function uses the common
    // ancestor of the `receiverHash` commit and `giverHash` commit to
    // avoid trivial conflicts.
    mergeDiff: function(receiverHash, giverHash) {
      return diff.tocDiff(objects.commitToc(receiverHash),
                          objects.commitToc(giverHash),
                          objects.commitToc(merge.commonAncestor(receiverHash, giverHash)));
    },

    // **writeMergeMsg()** creates a message for the merge commit that
    // will potentially be created when the `giverHash` commit is merged
    // into the `receiverHash` commit.  It writes this message to
    // `.gitlet/MERGE_MSG`.
    writeMergeMsg: function(receiverHash, giverHash, ref) {
      let msg = "Merge " + ref + " into " + refs.headBranchName();

      let mergeDiff = merge.mergeDiff(receiverHash, giverHash);
      let conflicts = Object.keys(mergeDiff)
          .filter(function(p) { return mergeDiff[p].status === diff.FILE_STATUS.CONFLICT });
      if (conflicts.length > 0) {
        msg += "\nConflicts:\n" + conflicts.join("\n");
      }

      files.write(files.gitletPath("MERGE_MSG"), msg);
    },

    // **writeIndex()** merges the `giverHash` commit into the
    // `receiverHash` commit and writes the merged content to the index.
    writeIndex: function(receiverHash, giverHash) {
      let mergeDiff = merge.mergeDiff(receiverHash, giverHash);
      index.write({});
      Object.keys(mergeDiff).forEach(function(p) {
        if (mergeDiff[p].status === diff.FILE_STATUS.CONFLICT) {
          index.writeConflict(p,
                              objects.read(mergeDiff[p].receiver),
                              objects.read(mergeDiff[p].giver),
                              objects.read(mergeDiff[p].base));
        } else if (mergeDiff[p].status === diff.FILE_STATUS.MODIFY) {
          index.writeNonConflict(p, objects.read(mergeDiff[p].giver));
        } else if (mergeDiff[p].status === diff.FILE_STATUS.ADD ||
                   mergeDiff[p].status === diff.FILE_STATUS.SAME) {
          let content = objects.read(mergeDiff[p].receiver || mergeDiff[p].giver);
          index.writeNonConflict(p, content);
        }
      });
    },

    // **writeFastForwardMerge()** Fast forwarding means making the
    // current branch reflect the commit that `giverHash` points at.  No
    // new commit is created.
    writeFastForwardMerge: function(receiverHash, giverHash) {

      // Point head at `giverHash`.
      refs.write(refs.toLocalRef(refs.headBranchName()), giverHash);

      // Make the index mirror the content of `giverHash`.
      index.write(index.tocToIndex(objects.commitToc(giverHash)));

      // If the repo is bare, it has no working copy, so there is no
      // more work to do.  If the repo is not bare...
      if (!config.isBare()) {

        // ...Get an object that maps from file paths in the
        // `receiverHash` commit to hashes of the files' content.  If
        // `recevierHash` is undefined, the repository has no commits,
        // yet, and the mapping object is empty.
        let receiverToc = receiverHash === undefined ? {} : objects.commitToc(receiverHash);

        // ...and write the content of the files to the working copy.
        workingCopy.write(diff.tocDiff(receiverToc, objects.commitToc(giverHash)));
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
    writeNonFastForwardMerge: function(receiverHash, giverHash, giverRef) {

      // Write `giverHash` to `.gitlet/MERGE_HEAD`.  This file acts as a
      // record of `giverHash` and as the signal that the repository is
      // in the merging state.
      refs.write("MERGE_HEAD", giverHash);

      // Write a standard merge commit message that will be used when
      // the merge commit is created.
      merge.writeMergeMsg(receiverHash, giverHash, giverRef);

      // Merge the `receiverHash` commit with the `giverHash` commit and
      // write the content to the index.
      merge.writeIndex(receiverHash, giverHash);

      // If the repo is bare, it has no working copy, so there is no
      // more work to do.  If the repo is not bare...
      if (!config.isBare()) {

        // ...merge the `receiverHash` commit with the `giverHash`
        // commit and write the content to the working copy.
        workingCopy.write(merge.mergeDiff(receiverHash, giverHash));
      }
    }
  };

  module.exports = merge;
