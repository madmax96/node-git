// Objects module
// -----------

// Objects are files in the `.gitlet/objects/` directory.
// - A blob object stores the content of a file.  For example, if a
//   file called `numbers.txt` that contains `first` is added to the
//   index, a blob called `hash(first)` will be created containing
//   `"first"`.
// - A tree object stores a list of files and directories in a
//   directory in the repository.  Entries in the list for files point
//   to blob objects.  Entries in the list for directories point at
//   other tree objects.
// - A commit object stores a pointer to a tree object and a message.
//   It represents the state of the repository after a commit.

let objects = {

    // **writeTree()** stores a graph of tree objects that represent the
    // content currently in the index.
    writeTree: function(tree) {
      let treeObject = Object.keys(tree).map(function(key) {
        if (util.isString(tree[key])) {
          return "blob " + tree[key] + " " + key;
        } else {
          return "tree " + objects.writeTree(tree[key]) + " " + key;
        }
      }).join("\n") + "\n";

      return objects.write(treeObject);
    },

    // **fileTree()** takes a tree hash and finds the corresponding tree
    // object.  It reads the connected graph of tree objects into a
    // nested JS object, like:<br/>
    // `{ file1: "hash(1)", src: { file2:  "hash(2)" }`
    fileTree: function(treeHash, tree) {
      if (tree === undefined) { return objects.fileTree(treeHash, {}); }

      util.lines(objects.read(treeHash)).forEach(function(line) {
        let lineTokens = line.split(/ /);
        tree[lineTokens[2]] = lineTokens[0] === "tree" ?
          objects.fileTree(lineTokens[1], {}) :
          lineTokens[1];
      });

      return tree;
    },

    // **writeCommit()** creates a commit object and writes it to the
    // objects database.
    writeCommit: function(treeHash, message, parentHashes) {
      return objects.write("commit " + treeHash + "\n" +
                           parentHashes
                             .map(function(h) { return "parent " + h + "\n"; }).join("") +
                           "Date:  " + new Date().toString() + "\n" +
                           "\n" +
                           "    " + message + "\n");
    },

    // **write()** writes `str` to the objects database.
    write: function(str) {
      files.write(nodePath.join(files.gitletPath(), "objects", util.hash(str)), str);
      return util.hash(str);
    },

    // **isUpToDate()** returns true if the giver commit has already
    // been incorporated into the receiver commit.  That is, it returns
    // true if the giver commit is an ancestor of the receiver, or they
    // are the same commit.
    isUpToDate: function(receiverHash, giverHash) {
      return receiverHash !== undefined &&
        (receiverHash === giverHash || objects.isAncestor(receiverHash, giverHash));
    },

    // **exists()** returns true if there is an object in the database
    // called `objectHash`
    exists: function(objectHash) {
      return objectHash !== undefined &&
        fs.existsSync(nodePath.join(files.gitletPath(), "objects", objectHash));
    },

    // **read()** returns the content of the object called `objectHash`.
    read: function(objectHash) {
      if (objectHash !== undefined) {
        let objectPath = nodePath.join(files.gitletPath(), "objects", objectHash);
        if (fs.existsSync(objectPath)) {
          return files.read(objectPath);
        }
      }
    },

    // **allObjects()** returns an array of the string content of all
    // the objects in the database
    allObjects: function() {
      return fs.readdirSync(files.gitletPath("objects")).map(objects.read);
    },

    // **type()** parses `str` as an object and returns its type:
    // commit, tree or blob.
    type: function(str) {
      return { commit: "commit", tree: "tree", blob: "tree" }[str.split(" ")[0]] || "blob";
    },

    // **isAncestor()** returns true if `descendentHash` is a descendent
    // of `ancestorHash`.
    isAncestor: function(descendentHash, ancestorHash) {
      return objects.ancestors(descendentHash).indexOf(ancestorHash) !== -1;
    },

    // **ancestors()** returns an array of the hashes of all the
    // ancestor commits of `commitHash`.
    ancestors: function(commitHash) {
      let parents = objects.parentHashes(objects.read(commitHash));
      return util.flatten(parents.concat(parents.map(objects.ancestors)));
    },

    // **parentHashes()** parses `str` as a commit and returns the
    // hashes of its parents.
    parentHashes: function(str) {
      if (objects.type(str) === "commit") {
        return str.split("\n")
          .filter(function(line) { return line.match(/^parent/); })
          .map(function(line) { return line.split(" ")[1]; });
      }
    },

    // **parentHashes()** parses `str` as a commit and returns the tree
    // it points at.
    treeHash: function(str) {
      if (objects.type(str) === "commit") {
        return str.split(/\s/)[1];
      }
    },

    // **commitToc()** takes the hash of a commit and reads the content
    // stored in the tree on the commit.  It turns that tree into a
    // table of content that maps filenames to hashes of the files'
    // content, like: `{ "file1": hash(1), "a/file2": "hash(2)" }`
    commitToc: function(hash) {
      return files.flattenNestedTree(objects.fileTree(objects.treeHash(objects.read(hash))));
    }
  };

  module.exports = objects;
