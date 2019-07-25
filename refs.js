// Refs module
// -----------

// Refs are names for commit hashes.  The ref is the name of a file.
// Some refs represent local branches, like `refs/heads/master` or
// `refs/heads/feature`.  Some represent remote branches, like
// `refs/remotes/origin/master`.  Some represent important states of
// the repository, like `HEAD`, `MERGE_HEAD` and `FETCH_HEAD`.  Ref
// files contain either a hash or another ref.

const fs = require('fs');
const nodePath = require('path');
const Files = require('./files');
const Config = require('./config');
const Util = require('./util');
const Objects = require('./objects');

const Refs = {

  // **isRef()** returns true if `ref` matches valid qualified ref
  // syntax.
  isRef(ref) {
    return ref !== undefined
        && (ref.match('^refs/heads/[A-Za-z-]+$')
         || ref.match('^refs/remotes/[A-Za-z-]+/[A-Za-z-]+$')
         || ['HEAD', 'FETCH_HEAD', 'MERGE_HEAD'].indexOf(ref) !== -1);
  },

  // **terminalRef()** resolves `ref` to the most specific ref
  // possible.
  terminalRef(ref) {
    // If `ref` is "HEAD" and head is pointing at a branch, return the
    // branch.
    if (ref === 'HEAD' && !Refs.isHeadDetached()) {
      return Files.read(Files.gitletPath('HEAD')).match('ref: (refs/heads/.+)')[1];

      // If ref is qualified, return it.
    } if (Refs.isRef(ref)) {
      return ref;

      // Otherwise, assume ref is an unqualified local ref (like
      // `master`) and turn it into a qualified ref (like
      // `refs/heads/master`)
    }
    return Refs.toLocalRef(ref);
  },

  // **hash()** returns the hash that `refOrHash` points to.
  hash(refOrHash) {
    if (Objects.exists(refOrHash)) {
      return refOrHash;
    }
    const terminalRef = Refs.terminalRef(refOrHash);
    if (terminalRef === 'FETCH_HEAD') {
      return Refs.fetchHeadBranchToMerge(Refs.headBranchName());
    } if (Refs.exists(terminalRef)) {
      return Files.read(Files.gitletPath(terminalRef));
    }
  },

  // **isHeadDetached()** returns true if `HEAD` contains a commit
  // hash, rather than the ref of a branch.
  isHeadDetached() {
    return Files.read(Files.gitletPath('HEAD')).match('refs') === null;
  },

  // **isCheckedOut()** returns true if the repository is not bare and
  // `HEAD` is pointing at the branch called `branch`
  isCheckedOut(branch) {
    return !Config.isBare() && Refs.headBranchName() === branch;
  },

  // **toLocalRef()** converts the branch name `name` into a qualified
  // local branch ref.
  toLocalRef(name) {
    return `refs/heads/${name}`;
  },

  // **toRemoteRef()** converts `remote` and branch name `name` into a
  // qualified remote branch ref.
  toRemoteRef(remote, name) {
    return `refs/remotes/${remote}/${name}`;
  },

  // **write()** sets the content of the file for the qualified ref
  // `ref` to `content`.
  write(ref, content) {
    if (Refs.isRef(ref)) {
      Files.write(Files.gitletPath(nodePath.normalize(ref)), content);
    }
  },

  // **rm()** removes the file for the qualified ref `ref`.
  rm(ref) {
    if (Refs.isRef(ref)) {
      fs.unlinkSync(Files.gitletPath(ref));
    }
  },

  // **fetchHeadBranchToMerge()** reads the `FETCH_HEAD` file and gets
  // the hash that the remote `branchName` is pointing at.  For more
  // information about `FETCH_HEAD` see [gitlet.fetch()](#section-80).
  fetchHeadBranchToMerge(branchName) {
    return Util.lines(Files.read(Files.gitletPath('FETCH_HEAD')))
      .filter(l => l.match(`^.+ branch ${branchName} of`))
      .map(l => l.match('^([^ ]+) ')[1])[0];
  },

  // **localHeads()** returns a JS object that maps local branch names
  // to the hash of the commit they point to.
  localHeads() {
    return fs.readdirSync(nodePath.join(Files.gitletPath(), 'refs', 'heads'))
      .reduce((o, n) => Util.setIn(o, [n, Refs.hash(n)]), {});
  },

  // **exists()** returns true if the qualified ref `ref` exists.
  exists(ref) {
    return Refs.isRef(ref) && fs.existsSync(Files.gitletPath(ref));
  },

  // **headBranchName()** returns the name of the branch that `HEAD`
  // is pointing at.
  headBranchName() {
    if (!Refs.isHeadDetached()) {
      return Files.read(Files.gitletPath('HEAD')).match('refs/heads/(.+)')[1];
    }
  },

  // **commitParentHashes()** returns the array of commits that would
  // be the parents of the next commit.
  commitParentHashes() {
    const headHash = Refs.hash('HEAD');

    // If the repository is in the middle of a merge, return the
    // hashes of the two commits being merged.
    if (Refs.hash('MERGE_HEAD')) {
      return [headHash, Refs.hash('MERGE_HEAD')];

      // If this repository has no commits, return an empty array.
    } if (headHash === undefined) {
      return [];

      // Otherwise, return the hash of the commit that `HEAD` is
      // currently pointing at.
    }
    return [headHash];
  },
};

module.exports = Refs;
