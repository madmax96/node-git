// Working copy module
// -------------------

// The working copy is the set of files that are inside the
// repository, excluding the `.gitlet` directory.

const fs = require('fs');
const Files = require('./files');
const Diff = require('./diff');
const Objects = require('./objects');

const WorkingCopy = {

  // **write()** takes a diff object (see the diff module for a
  // description of the format) and applies the changes in it to the
  // working copy.
  write(dif) {
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
      return `<<<<<<\n${Objects.read(receiverFileHash)
      }\n======\n${Objects.read(giverFileHash)
      }\n>>>>>>\n`;
    }

    // Go through all the files that have changed, updating the
    // working copy for each.
    Object.keys(dif).forEach((p) => {
      if (dif[p].status === Diff.FILE_STATUS.ADD) {
        Files.write(Files.workingCopyPath(p), Objects.read(dif[p].receiver || dif[p].giver));
      } else if (dif[p].status === Diff.FILE_STATUS.CONFLICT) {
        Files.write(Files.workingCopyPath(p), composeConflict(dif[p].receiver, dif[p].giver));
      } else if (dif[p].status === Diff.FILE_STATUS.MODIFY) {
        Files.write(Files.workingCopyPath(p), Objects.read(dif[p].giver));
      } else if (dif[p].status === Diff.FILE_STATUS.DELETE) {
        fs.unlinkSync(Files.workingCopyPath(p));
      }
    });

    // Remove any directories that have been left empty after the
    // deletion of all the files in them.
    fs.readdirSync(Files.workingCopyPath())
      .filter(n => n !== '.gitlet')
      .forEach(Files.rmEmptyDirs);
  },
};

module.exports = WorkingCopy;
