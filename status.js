
// Status module
// -------------

// Outputs the repository status as a human-readable string.

const fs = require('fs');
const Files = require('./files');
const Diff = require('./diff');
const Refs = require('./refs');
const Objects = require('./objects');
const Util = require('./util');
const Index = require('./index');

const Status = {

  // **toString()** returns the repository status as a human-readable
  // string.
  toString() {
    // **untracked()** returns an array of lines listing the files not
    // being tracked by Gitlet.
    function untracked() {
      return fs.readdirSync(Files.workingCopyPath())
        .filter(p => Index.toc()[p] === undefined && p !== '.gitlet');
    }

    // **toBeCommitted()** returns an array of lines listing the files
    // that have changes that will be included in the next commit.
    function toBeCommitted() {
      const headHash = Refs.hash('HEAD');
      const headToc = headHash === undefined ? {} : Objects.commitToc(headHash);
      const ns = Diff.nameStatus(Diff.tocDiff(headToc, Index.toc()));
      return Object.keys(ns).map(p => `${ns[p]} ${p}`);
    }

    // **notStagedForCommit()** returns an array of lines listing the
    // files that have changes that will not be included in the next
    // commit.
    function notStagedForCommit() {
      const ns = Diff.nameStatus(Diff.diff());
      return Object.keys(ns).map(p => `${ns[p]} ${p}`);
    }

    // **listing()** keeps `lines` (prefixed by `heading`) only if it's nonempty.
    function listing(heading, lines) {
      return lines.length > 0 ? [heading, lines] : [];
    }

    // Gather all the sections, keeping only nonempty ones, and flatten them
    // together into a string.
    return Util.flatten([`On branch ${Refs.headBranchName()}`,
      listing('Untracked files:', untracked()),
      listing('Unmerged paths:', Index.conflictedPaths()),
      listing('Changes to be committed:', toBeCommitted()),
      listing('Changes not staged for commit:', notStagedForCommit())])
      .join('\n');
  },
};

module.exports = Status;
