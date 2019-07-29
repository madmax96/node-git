const fs = require('fs');
const nodePath = require('path');
const Files = require('./files');
const Config = require('./config');
const Diff = require('./diff');
const Refs = require('./refs');
const Objects = require('./objects');
const Status = require('./status');
const Util = require('./util');
const Merge = require('./merge');
const WorkingCopy = require('./workingCopy');
const Index = require('./index');
// Main Git API functions
// ----------------------

const Gitlet = {

  // **init()** initializes the current directory as a new repository.
  init(opts = {}) {
    // Abort if already a repository.
    if (Files.inRepo()) { return; }

    // Create a JS object that mirrors the Git basic directory
    // structure.
    const GitletStructure = {
      HEAD: 'ref: refs/heads/master\n',

      // If `--bare` was passed, write to the Git config indicating
      // that the repository is bare.  If `--bare` was not passed,
      // write to the Git config saying the repository is not bare.
      config: Config.objToStr({ core: { '': { bare: opts.bare === true } } }),

      objects: {},
      refs: {
        heads: {},
      },
    };

    // Write the standard Git directory structure using the
    // `GitletStructure` JS object.  If the repository is not bare,
    // put the directories inside the `.Gitlet` directory.  If the
    // repository is bare, put them in the top level of the
    // repository.
    Files.writeFilesFromTree(opts.bare ? GitletStructure : { '.Gitlet': GitletStructure },
      process.cwd());
  },

  // **add()** adds files that match `path` to the Index.
  add(path, _) {
    Files.assertInRepo();
    Config.assertNotBare();

    // Get the paths of all the files matching `path`.
    const addedFiles = Files.lsRecursive(path);

    // Abort if no files matched `path`.
    if (addedFiles.length === 0) {
      throw new Error(`${Files.pathFromRepoRoot(path)} did not match any files`);

    // Otherwise, use the `update_index()` Git command to actually add
    // the Files.
    } else {
      addedFiles.forEach((p) => { Gitlet.update_index(p, { add: true }); });
    }
  },

  // **rm()** removes files that match `path` from the Working dir and Index.
  rm(path, opts = {}) {
    Files.assertInRepo();
    Config.assertNotBare();

    // Get the paths of all files in the index that match `path`.
    const filesToRm = Index.matchingFiles(path);

    // Abort if `-f` was passed. The removal of files with changes is
    // not supported.
    if (opts.f) {
      throw new Error('unsupported');

    // Abort if no files matched `path`.
    } else if (filesToRm.length === 0) {
      throw new Error(`${Files.pathFromRepoRoot(path)} did not match any files`);

    // Abort if `path` is a directory and `-r` was not passed.
    } else if (fs.existsSync(path) && fs.statSync(path).isDirectory() && !opts.r) {
      throw new Error(`not removing ${path} recursively without -r`);
    } else {
      // Get a list of all files that are to be removed and have also
      // been changed on disk.  If this list is not empty then abort.
      const changesToRm = Util.intersection(Diff.addedOrModifiedFiles(), filesToRm);
      if (changesToRm.length > 0) {
        throw new Error(`these files have changes:\n${changesToRm.join('\n')}\n`);

      // Otherwise, remove the files that match `path`. Delete them
      // from disk and remove from the Index.
      } else {
        filesToRm.map(Files.workingCopyPath).filter(fs.existsSync).forEach(fs.unlinkSync);
        filesToRm.forEach((p) => { Gitlet.update_index(p, { remove: true }); });
      }
    }
  },

  // **commit()** creates a commit object that represents the current
  // state of the index, writes the commit to the `objects` directory
  // and points `HEAD` at the commit.
  commit(opts) {
    Files.assertInRepo();
    Config.assertNotBare();
    // Write a tree set of tree objects that represent the current
    // state of the Index.
    const treeHash = Gitlet.write_tree();

    const headDesc = Refs.isHeadDetached() ? 'detached HEAD' : Refs.headBranchName();
    // Compare the hash of the tree object at the top of the tree that
    // was just written with the hash of the tree object that the
    // `HEAD` commit points at.  If they are the same, abort because
    // there is nothing new to commit.
    if (Refs.hash('HEAD') !== undefined
        && treeHash === Objects.treeHash(Objects.read(Refs.hash('HEAD')))) {
      throw new Error(`# On  ${headDesc} \n nothing to commit, working directory clean`);
    } else {
      // Abort if the repository is in the merge state and there are
      // unresolved merge conflicts.
      const conflictedPaths = Index.conflictedPaths();
      if (Merge.isMergeInProgress() && conflictedPaths.length > 0) {
        throw new Error(`${conflictedPaths.map(p => `U  ${p}`).join('\n')
        }\ncannot commit because you have unmerged files\n`);

      // Otherwise, do the commit.
      } else {
        // If the repository is in the merge state, use a pre-written
        // merge commit message.  If the repository is not in the
        // merge state, use the message passed with `-m`.
        const m = Merge.isMergeInProgress() ? Files.read(Files.GitletPath('MERGE_MSG')) : opts.m;

        // Write the new commit to the `objects` directory.
        const commitHash = Objects.writeCommit(treeHash, m, Refs.commitParentHashes());

        // Point `HEAD` at new commit.
        Gitlet.update_ref('HEAD', commitHash);

        // If `MERGE_HEAD` exists, the repository was in the merge
        // state. Remove `MERGE_HEAD` and `MERGE_MSG`to exit the merge
        // state.  Report that the merge is complete.
        if (Merge.isMergeInProgress()) {
          fs.unlinkSync(Files.GitletPath('MERGE_MSG'));
          Refs.rm('MERGE_HEAD');
          return 'Merge made by the three-way strategy';

        // Repository was not in the merge state, so just report that
        // the commit is complete.
        }
        return `[ ${headDesc}  ${commitHash} ]  ${m}`;
      }
    }
  },

  // **branch()** creates a new branch that points at the commit that
  // `HEAD` points at.
  branch(name, opts = {}) {
    Files.assertInRepo();

    // If no branch `name` was passed, list the local branches.
    if (name === undefined) {
      return `${Object.keys(Refs.localHeads()).map(branch => (branch === Refs.headBranchName() ? '* ' : '  ') + branch)
        .join('\n')}\n`;

    // `HEAD` is not pointing at a commit, so there is no commit for
    // the new branch to point at.  Abort.  This is most likely to
    // happen if the repository has no commits.
    } if (Refs.hash('HEAD') === undefined) {
      throw new Error(`${Refs.headBranchName()} not a valid object name`);

    // Abort because a branch called `name` already exists.
    } else if (Refs.exists(Refs.toLocalRef(name))) {
      throw new Error(`A branch named ${name} already exists`);

    // Otherwise, create a new branch by creating a new file called
    // `name` that contains the hash of the commit that `HEAD` points
    // at.
    } else {
      Gitlet.update_ref(Refs.toLocalRef(name), Refs.hash('HEAD'));
    }
  },

  // **checkout()** changes the index, working copy and `HEAD` to
  // reflect the content of `ref`.  `ref` might be a branch name or a
  // commit hash.
  checkout(ref, _) {
    Files.assertInRepo();
    Config.assertNotBare();

    // Get the hash of the commit to check out.
    const toHash = Refs.hash(ref);

    // Abort if `ref` cannot be found.
    if (!Objects.exists(toHash)) {
      throw new Error(`${ref} did not match any file(s) known to Gitlet`);

    // Abort if the hash to check out points to an object that is a
    // not a commit.
    } else if (Objects.type(Objects.read(toHash)) !== 'commit') {
      throw new Error(`reference is not a tree: ${ref}`);

    // Abort if `ref` is the name of the branch currently checked out.
    // Abort if head is detached, `ref` is a commit hash and `HEAD` is
    // pointing at that hash.
    } else if (ref === Refs.headBranchName()
               || ref === Files.read(Files.GitletPath('HEAD'))) {
      return `Already on ${ref}`;
    } else {
      // Get a list of files changed in the working copy.  Get a list
      // of the files that are different in the head commit and the
      // commit to check out.  If any files appear in both lists then
      // abort.
      const paths = Diff.changedFilesCommitWouldOverwrite(toHash);
      if (paths.length > 0) {
        throw new Error(`local changes would be lost\n${paths.join('\n')}\n`);

      // Otherwise, perform the checkout.
      } else {
        process.chdir(Files.workingCopyPath());

        // If the ref is in the `objects` directory, it must be a hash
        // and so this checkout is detaching the head.
        const isDetachingHead = Objects.exists(ref);

        // Get the list of differences between the current commit and
        // the commit to check out.  Write them to the working copy.
        WorkingCopy.write(Diff.diff(Refs.hash('HEAD'), toHash));

        // Write the commit being checked out to `HEAD`. If the head
        // is being detached, the commit hash is written directly to
        // the `HEAD` file.  If the head is not being detached, the
        // branch being checked out is written to `HEAD`.
        Refs.write('HEAD', isDetachingHead ? toHash : `ref: ${Refs.toLocalRef(ref)}`);

        // Set the index to the contents of the commit being checked
        // out.
        Index.write(Index.tocToIndex(Objects.commitToc(toHash)));

        // Report the result of the checkout.
        return isDetachingHead
          ? `Note: checking out ${toHash}\nYou are in detached HEAD state.`
          : `Switched to branch ${ref}`;
      }
    }
  },

  // **diff()** shows the changes required to go from the `ref1`
  // commit to the `ref2` commit.
  diff(ref1, ref2, opts) {
    Files.assertInRepo();
    Config.assertNotBare();

    // Abort if `ref1` was supplied, but it does not resolve to a
    // hash.
    if (ref1 !== undefined && Refs.hash(ref1) === undefined) {
      throw new Error(`ambiguous argument ${ref1}: unknown revision`);

    // Abort if `ref2` was supplied, but it does not resolve to a
    // hash.
    } else if (ref2 !== undefined && Refs.hash(ref2) === undefined) {
      throw new Error(`ambiguous argument ${ref2}: unknown revision`);

    // Otherwise, perform Diff.
    } else {
      // Gitlet only shows the name of each changed file and whether
      // it was added, modified or deleted.  For simplicity, the
      // changed content is not shown.

      // The diff happens between two versions of the repository.  The
      // first version is either the hash that `ref1` resolves to, or
      // the Index.  The second version is either the hash that `ref2`
      // resolves to, or the working copy.
      const nameToStatus = Diff.nameStatus(Diff.diff(Refs.hash(ref1), Refs.hash(ref2)));

      // Show the path of each changed file.
      return `${Object.keys(nameToStatus)
        .map(path => `${nameToStatus[path]} ${path}`)
        .join('\n')}\n`;
    }
  },

  // **remote()** records the locations of remote versions of this
  // repository.
  remote(command, name, path, _) {
    Files.assertInRepo();

    // Abort if `command` is not "add".  Only "add" is supported.
    if (command !== 'add') {
      throw new Error('unsupported');

    // Abort if repository already has a record for a remote called
    // `name`.
    } else if (name in Config.read().remote) {
      throw new Error(`remote ${name} already exists`);

    // Otherwise, add remote record.
    } else {
      // Write to the config file a record of the `name` and `path` of
      // the remote.
      Config.write(Util.setIn(Config.read(), ['remote', name, 'url', path]));
      return '\n';
    }
  },

  // **fetch()** records the commit that `branch` is at on `remote`.
  // It does not change the local branch.
  fetch(remote, branch, _) {
    Files.assertInRepo();

    // Abort if a `remote` or `branch` not passed.
    if (remote === undefined || branch === undefined) {
      throw new Error('unsupported');

    // Abort if `remote` not recorded in config file.
    } else if (!(remote in Config.read().remote)) {
      throw new Error(`${remote} does not appear to be a git repository`);
    } else {
      // Get the location of the remote.
      const remoteUrl = Config.read().remote[remote].url;

      // Turn the unqualified branch name into a qualified remote ref
      // eg `[branch] -> refs/remotes/[remote]/[branch]`
      const remoteRef = Refs.toRemoteRef(remote, branch);

      // Go to the remote repository and get the hash of the commit
      // that `branch` is on.
      const newHash = Util.onRemote(remoteUrl)(Refs.hash, branch);

      // Abort if `branch` did not exist on the remote.
      if (newHash === undefined) {
        throw new Error(`couldn't find remote ref ${branch}`);

      // Otherwise, perform the fetch.
      } else {
        // Note down the hash of the commit this repository currently
        // thinks the remote branch is on.
        const oldHash = Refs.hash(remoteRef);

        // Get all the objects in the remote `objects` directory and
        // write them.  to the local `objects` directory.  (This is an
        // inefficient way of getting all the objects required to
        // recreate locally the commit the remote branch is on.)
        const remoteObjects = Util.onRemote(remoteUrl)(Objects.allObjects);
        remoteObjects.forEach(Objects.write);

        // Set the contents of the file at
        // `.Gitlet/refs/remotes/[remote]/[branch]` to `newHash`, the
        // hash of the commit that the remote branch is on.
        Gitlet.update_ref(remoteRef, newHash);

        // Record the hash of the commit that the remote branch is on
        // in `FETCH_HEAD`.  (The user can call `Gitlet merge
        // FETCH_HEAD` to merge the remote version of the branch into
        // their local branch.  For more details, see
        // [Gitlet.merge()](#section-93).)
        Refs.write('FETCH_HEAD', `${newHash} branch ${branch} of ${remoteUrl}`);

        // Report the result of the fetch.
        return `${[`From ${remoteUrl}`,
          `Count ${remoteObjects.length}`,
          `${branch} -> ${remote}/${branch
          }${Merge.isAForceFetch(oldHash, newHash) ? ' (forced)' : ''}`].join('\n')}\n`;
      }
    }
  },

  // **merge()** finds the set of differences between the commit that
  // the currently checked out branch is on and the commit that `ref`
  // points to.  It finds or creates a commit that applies these
  // differences to the checked out branch.
  merge(ref, _) {
    Files.assertInRepo();
    Config.assertNotBare();

    // Get the `receiverHash`, the hash of the commit that the
    // current branch is on.
    const receiverHash = Refs.hash('HEAD');

    // Get the `giverHash`, the hash for the commit to merge into the
    // receiver commit.
    const giverHash = Refs.hash(ref);

    // Abort if head is detached.  Merging into a detached head is not
    // supported.
    if (Refs.isHeadDetached()) {
      throw new Error('unsupported');

    // Abort if `ref` did not resolve to a hash, or if that hash is
    // not for a commit object.
    } else if (giverHash === undefined || Objects.type(Objects.read(giverHash)) !== 'commit') {
      throw new Error(`${ref}: expected commit type`);

    // Do not merge if the current branch - the receiver - already has
    // the giver's changes.  This is the case if the receiver and
    // giver are the same commit, or if the giver is an ancestor of
    // the receiver.
    } else if (Objects.isUpToDate(receiverHash, giverHash)) {
      return 'Already up-to-date';
    } else {
      // Get a list of files changed in the working copy.  Get a list
      // of the files that are different in the receiver and giver. If
      // any files appear in both lists then abort.
      const paths = Diff.changedFilesCommitWouldOverwrite(giverHash);
      if (paths.length > 0) {
        throw new Error(`local changes would be lost\n${paths.join('\n')}\n`);

      // If the receiver is an ancestor of the giver, a fast forward
      // is performed.  This is possible because there is already a
      // commit that incorporates all of the giver's changes into the
      // receiver.
      } else if (Merge.canFastForward(receiverHash, giverHash)) {
        // Fast forwarding means making the current branch reflect the
        // commit that `giverHash` points at.  The branch is pointed
        // at `giverHash`.  The index is set to match the contents of
        // the commit that `giverHash` points at.  The working copy is
        // set to match the contents of that commit.
        Merge.writeFastForwardMerge(receiverHash, giverHash);
        return 'Fast-forward';

      // If the receiver is not an ancestor of the giver, a merge
      // commit must be created.
      } else {
        // The repository is put into the merge state.  The
        // `MERGE_HEAD` file is written and its contents set to
        // `giverHash`.  The `MERGE_MSG` file is written and its
        // contents set to a boilerplate merge commit message.  A
        // merge diff is created that will turn the contents of
        // receiver into the contents of giver.  This contains the
        // path of every file that is different and whether it was
        // added, removed or modified, or is in conflict.  Added files
        // are added to the index and working copy.  Removed files are
        // removed from the index and working copy.  Modified files
        // are modified in the index and working copy.  Files that are
        // in conflict are written to the working copy to include the
        // receiver and giver versions.  Both the receiver and giver
        // versions are written to the Index.
        Merge.writeNonFastForwardMerge(receiverHash, giverHash, ref);

        // If there are any conflicted files, a message is shown to
        // say that the user must sort them out before the merge can
        // be completed.
        if (Merge.hasConflicts(receiverHash, giverHash)) {
          return 'Automatic merge failed. Fix conflicts and commit the result.';

        // If there are no conflicted files, a commit is created from
        // the merged changes and the merge is over.
        }
        return Gitlet.commit();
      }
    }
  },

  // **pull()** fetches the commit that `branch` is on at `remote`.
  // It merges that commit into the current branch.
  pull(remote, branch, _) {
    Files.assertInRepo();
    Config.assertNotBare();
    Gitlet.fetch(remote, branch);
    return Gitlet.merge('FETCH_HEAD');
  },

  // **push()** gets the commit that `branch` is on in the local repo
  // and points `branch` on `remote` at the same commit.
  push(remote, branch, opts = {}) {
    Files.assertInRepo();

    // Abort if a `remote` or `branch` not passed.
    if (remote === undefined || branch === undefined) {
      throw new Error('unsupported');

    // Abort if `remote` not recorded in config file.
    } else if (!(remote in Config.read().remote)) {
      throw new Error(`${remote} does not appear to be a git repository`);
    } else {
      const remotePath = Config.read().remote[remote].url;
      const remoteCall = Util.onRemote(remotePath);

      // Abort if remote repository is not bare and `branch` is
      // checked out.
      if (remoteCall(Refs.isCheckedOut, branch)) {
        throw new Error(`refusing to update checked out branch ${branch}`);
      } else {
        // Get `receiverHash`, the hash of the commit that `branch` is
        // on at `remote`.
        const receiverHash = remoteCall(Refs.hash, branch);

        // Get `giverHash`, the hash of the commit that `branch` is on
        // at the local repository.
        const giverHash = Refs.hash(branch);

        // Do nothing if the remote branch - the receiver - has
        // already incorporated the commit that `giverHash` points
        // to. This is the case if the receiver commit and giver
        // commit are the same, or if the giver commit is an ancestor
        // of the receiver commit.
        if (Objects.isUpToDate(receiverHash, giverHash)) {
          return 'Already up-to-date';

        // Abort if `branch` on `remote` cannot be fast forwarded to
        // the commit that `giverHash` points to.  A fast forward can
        // only be done if the receiver commit is an ancestor of the
        // giver commit.
        } if (!opts.f && !Merge.canFastForward(receiverHash, giverHash)) {
          throw new Error(`failed to push some refs to ${remotePath}`);

        // Otherwise, do the push.
        } else {
          // Put all the objects in the local `objects` directory into
          // the remote `objects` directory.
          Objects.allObjects().forEach((o) => { remoteCall(Objects.write, o); });

          // Point `branch` on `remote` at `giverHash`.
          remoteCall(Gitlet.update_ref, Refs.toLocalRef(branch), giverHash);

          // Set the local repo's record of what commit `branch` is on
          // at `remote` to `giverHash` (since that is what it is now
          // is).
          Gitlet.update_ref(Refs.toRemoteRef(remote, branch), giverHash);

          // Report the result of the push.
          return `${[`To ${remotePath}`,
            `Count ${Objects.allObjects().length}`,
            `${branch} -> ${branch}`].join('\n')}\n`;
        }
      }
    }
  },

  // **status()** reports the state of the repo: the current branch,
  // untracked files, conflicted files, files that are staged to be
  // committed and files that are not staged to be committed.
  status(_) {
    Files.assertInRepo();
    Config.assertNotBare();
    return Status.toString();
  },

  // **clone()** copies the repository at `remotePath` to
  // **`targetPath`.
  clone(remotePath, targetPath, opts = {}) {
    // Abort if a `remotePath` or `targetPath` not passed.
    if (remotePath === undefined || targetPath === undefined) {
      throw new Error('you must specify remote path and target path');

    // Abort if `remotePath` does not exist, or is not a Gitlet
    // repository.
    } else if (!fs.existsSync(remotePath) || !Util.onRemote(remotePath)(Files.inRepo)) {
      throw new Error(`repository ${remotePath} does not exist`);

    // Abort if `targetPath` exists and is not empty.
    } else if (fs.existsSync(targetPath) && fs.readdirSync(targetPath).length > 0) {
      throw new Error(`${targetPath} already exists and is not empty`);

    // Otherwise, do the clone.
    } else {
      remotePath = nodePath.resolve(process.cwd(), remotePath);

      // If `targetPath` doesn't exist, create it.
      if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath);
      }

      // In the directory for the new remote repository...
      Util.onRemote(targetPath)(() => {
        // Initialize the directory as a Gitlet repository.
        Gitlet.init(opts);

        // Set up `remotePath` as a remote called "origin".
        Gitlet.remote('add', 'origin', nodePath.relative(process.cwd(), remotePath));

        // Get the hash of the commit that master is pointing at on
        // the remote repository.
        const remoteHeadHash = Util.onRemote(remotePath)(Refs.hash, 'master');

        // If the remote repo has any commits, that hash will exist.
        // The new repository records the commit that the passed
        // `branch` is at on the remote.  It then sets master on the
        // new repository to point at that commit.
        if (remoteHeadHash !== undefined) {
          Gitlet.fetch('origin', 'master');
          Merge.writeFastForwardMerge(undefined, remoteHeadHash);
        }
      });

      // Report the result of the clone.
      return `Cloning into ${targetPath}`;
    }
  },

  // **update_index()** adds the contents of the file at `path` to the
  // index, or removes the file from the Index.
  update_index(path, opts = {}) {
    Files.assertInRepo();
    Config.assertNotBare();

    const pathFromRoot = Files.pathFromRepoRoot(path);
    const isOnDisk = fs.existsSync(path);
    const isInIndex = Index.hasFile(path, 0);

    // Abort if `path` is a directory.  `update_index()` only handles
    // single Files.
    if (isOnDisk && fs.statSync(path).isDirectory()) {
      throw new Error(`${pathFromRoot} is a directory - add files inside\n`);
    } else if (opts.remove && !isOnDisk && isInIndex) {
      // Abort if file is being removed and is in conflict.  Gitlet
      // doesn't support this.
      if (Index.isFileInConflict(path)) {
        throw new Error('unsupported');

      // If files is being removed, is not on disk and is in the
      // index, remove it from the Index.
      } else {
        Index.writeRm(path);
        return '\n';
      }

    // If file is being removed, is not on disk and not in the index,
    // there is no work to do.
    } else if (opts.remove && !isOnDisk && !isInIndex) {
      return '\n';

    // Abort if the file is on disk and not in the index and the
    // `--add` was not passed.
    } else if (!opts.add && isOnDisk && !isInIndex) {
      throw new Error(`cannot add ${pathFromRoot} to index - use --add option\n`);

    // If file is on disk and either `-add` was passed or the file is
    // in the index, add the file's current content to the Index.
    } else if (isOnDisk && (opts.add || isInIndex)) {
      Index.writeNonConflict(path, Files.read(Files.workingCopyPath(path)));
      return '\n';

    // Abort if the file is not on disk and `--remove` not passed.
    } else if (!opts.remove && !isOnDisk) {
      throw new Error(`${pathFromRoot} does not exist and --remove not passed\n`);
    }
  },

  // **write_tree()** takes the content of the index and stores a tree
  // object that represents that content to the `objects` directory.
  write_tree(_) {
    Files.assertInRepo();
    return Objects.writeTree(Files.nestFlatTree(Index.toc()));
  },

  // **update_ref()** gets the hash of the commit that `refToUpdateTo`
  // points at and sets `refToUpdate` to point at the same hash.
  update_ref(refToUpdate, refToUpdateTo, _) {
    Files.assertInRepo();

    // Get the hash that `refToUpdateTo` points at.
    const hash = Refs.hash(refToUpdateTo);

    // Abort if `refToUpdateTo` does not point at a hash.
    if (!Objects.exists(hash)) {
      throw new Error(`${refToUpdateTo} not a valid SHA1`);

    // Abort if `refToUpdate` does not match the syntax of a ref.
    } else if (!Refs.isRef(refToUpdate)) {
      throw new Error(`cannot lock the ref ${refToUpdate}`);

    // Abort if `hash` points to an object in the `objects` directory
    // that is not a commit.
    } else if (Objects.type(Objects.read(hash)) !== 'commit') {
      const branch = Refs.terminalRef(refToUpdate);
      throw new Error(`${branch} cannot refer to non-commit object ${hash}\n`);

    // Otherwise, set the contents of the file that the ref represents
    // to `hash`.
    } else {
      Refs.write(Refs.terminalRef(refToUpdate), hash);
    }
  },
};


// Running Gitlet.js as a script
// -----------------------------

// Gitlet can be used from the command line.  For example, executing
// `node Gitlet.js commit -m woo` would commit to the current repo
// with the message "woo".

// **parseOptions()** takes the `process.argv` object passed when
// Gitlet.js is run as a script. It returns an object that contains
// the parsed parameters to be formed into a Gitlet command.
const parseOptions = function (argv) {
  let name;
  return argv.reduce((opts, arg) => {
    if (arg.match(/^-/)) {
      name = arg.replace(/^-+/, '');
      opts[name] = true;
    } else if (name !== undefined) {
      opts[name] = arg;
      name = undefined;
    } else {
      opts._.push(arg);
    }

    return opts;
  }, { _: [] });
};

// **runCli()** takes the `process.argv` object passed when Gitlet.js
// is run as a script.  It parses the command line arguments, runs the
// corresponding Gitlet command and returns the string returned by the
// command.
const runCli = module.exports.runCli = function (argv) {
  const opts = parseOptions(argv);
  const commandName = opts._[2];

  if (commandName === undefined) {
    throw new Error('you must specify a Gitlet command to run');
  } else {
    const commandFnName = commandName.replace(/-/g, '_');
    const fn = Gitlet[commandFnName];

    if (fn === undefined) {
      throw new Error(`'${commandFnName}' is not a Gitlet command`);
    } else {
      const commandArgs = opts._.slice(3);
      while (commandArgs.length < fn.length - 1) {
        commandArgs.push(undefined);
      }

      return fn.apply(Gitlet, commandArgs.concat(opts));
    }
  }
};

// If `Gitlet.js` is run as a script, pass the `process.argv` array of
// script arguments to `runCli()` so they can be used to run a Gitlet
// command.  Print the return value of the Gitlet command.  If the
// Gitlet command throws, print the error message.
if (require.main === module) {
  try {
    const result = runCli(process.argv);
    if (result !== undefined) {
      console.log(result);
    }
  } catch (e) {
    console.error(e.toString());
  }
}

module.exports = Gitlet;
