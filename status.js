
// Status module
// -------------

// Outputs the repository status as a human-readable string.

let status = {

    // **toString()** returns the repository status as a human-readable
    // string.
    toString: function() {

      // **untracked()** returns an array of lines listing the files not
      // being tracked by Gitlet.
      function untracked() {
        return fs.readdirSync(files.workingCopyPath())
            .filter(function(p) { return index.toc()[p] === undefined && p !== ".gitlet"; });
      };

      // **toBeCommitted()** returns an array of lines listing the files
      // that have changes that will be included in the next commit.
      function toBeCommitted() {
        let headHash = refs.hash("HEAD");
        let headToc = headHash === undefined ? {} : objects.commitToc(headHash);
        let ns = diff.nameStatus(diff.tocDiff(headToc, index.toc()));
        return Object.keys(ns).map(function(p) { return ns[p] + " " + p; });
      };

      // **notStagedForCommit()** returns an array of lines listing the
      // files that have changes that will not be included in the next
      // commit.
      function notStagedForCommit() {
        let ns = diff.nameStatus(diff.diff());
        return Object.keys(ns).map(function(p) { return ns[p] + " " + p; });
      };

      // **listing()** keeps `lines` (prefixed by `heading`) only if it's nonempty.
      function listing(heading, lines) {
        return lines.length > 0 ? [heading, lines] : [];
      }

      // Gather all the sections, keeping only nonempty ones, and flatten them
      // together into a string.
      return util.flatten(["On branch " + refs.headBranchName(),
                           listing("Untracked files:", untracked()),
                           listing("Unmerged paths:", index.conflictedPaths()),
                           listing("Changes to be committed:", toBeCommitted()),
                           listing("Changes not staged for commit:", notStagedForCommit())])
          .join("\n");
    }
  };

  module.exports = status;
