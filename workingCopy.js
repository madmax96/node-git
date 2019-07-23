// Working copy module
// -------------------

// The working copy is the set of files that are inside the
// repository, excluding the `.gitlet` directory.

const workingCopy = {

    // **write()** takes a diff object (see the diff module for a
    // description of the format) and applies the changes in it to the
    // working copy.
    write: function(dif) {

      // `composeConflict()` takes the hashes of two versions of the
      // same file and returns a string that represents the two versions
      // as a conflicted file:
      // <pre><<<<<
      // version1
      // `======
      // version2
      // `>>>>></pre>
      // Note that Gitlet, unlike real Git, does not do a line by line
      // diff and mark only the conflicted parts of the file.  If a file
      // is in conflict, the whole body of the file is marked as one big
      // conflict.
      function composeConflict(receiverFileHash, giverFileHash) {
        return "<<<<<<\n" + objects.read(receiverFileHash) +
          "\n======\n" + objects.read(giverFileHash) +
          "\n>>>>>>\n";
      };

      // Go through all the files that have changed, updating the
      // working copy for each.
      Object.keys(dif).forEach(function(p) {
        if (dif[p].status === diff.FILE_STATUS.ADD) {
          files.write(files.workingCopyPath(p), objects.read(dif[p].receiver || dif[p].giver));
        } else if (dif[p].status === diff.FILE_STATUS.CONFLICT) {
          files.write(files.workingCopyPath(p), composeConflict(dif[p].receiver, dif[p].giver));
        } else if (dif[p].status === diff.FILE_STATUS.MODIFY) {
          files.write(files.workingCopyPath(p), objects.read(dif[p].giver));
        } else if (dif[p].status === diff.FILE_STATUS.DELETE) {
          fs.unlinkSync(files.workingCopyPath(p));
        }
      });

      // Remove any directories that have been left empty after the
      // deletion of all the files in them.
      fs.readdirSync(files.workingCopyPath())
        .filter(function(n) { return n !== ".gitlet"; })
        .forEach(files.rmEmptyDirs);
    }
  };

  module.exports = workingCopy;
