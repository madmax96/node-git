// Objects module
// -----------

// Objects are files in the `.gitlet/objects/` directory.
// - A blob object stores the content of a file.  For example, if a
//   file called `numbers.txt` that contains `first` is added to the
//   index, a blob called `hash(first)` will be created containing
//   `"first"`.
// - A tree object stores a list of files and directories in a
//   directory in the repository.  Entries in the list for files point
//   to blob Objects.  Entries in the list for directories point at
//   other tree Objects.
// - A commit object stores a pointer to a tree object and a message.
//   It represents the state of the repository after a commit.

const fs = require('fs');
const nodePath = require('path');
const Files = require('./files');
const Util = require('./util');

const Objects = {

  // **writeTree()** stores a tree of objects that represent the
  // content currently in the index.
  writeTree(tree) {
    const treeObject = `${Object.keys(tree).map((key) => {
      if (Util.isString(tree[key])) {
        return `blob ${tree[key]} ${key}`;
      }
      return `tree ${Objects.writeTree(tree[key])} ${key}`;
    }).join('\n')}\n`;

    return Objects.write(treeObject);
  },

  // **fileTree()** takes a tree hash and finds the corresponding tree
  // object.  It reads the connected graph of tree objects into a
  // nested JS object, like:<br/>
  // `{ file1: "hash(1)", src: { file2:  "hash(2)" }`
  fileTree(treeHash, tree) {
    if (tree === undefined) { return Objects.fileTree(treeHash, {}); }

    Util.lines(Objects.read(treeHash)).forEach((line) => {
      const lineTokens = line.split(/ /);
      tree[lineTokens[2]] = lineTokens[0] === 'tree'
        ? Objects.fileTree(lineTokens[1], {})
        : lineTokens[1];
    });

    return tree;
  },

  // **writeCommit()** creates a commit object and writes it to the
  // objects database.
  writeCommit(treeHash, message, parentHashes) {
    return Objects.write(`commit ${treeHash}\n${
      parentHashes
        .map(h => `parent ${h}\n`).join('')
    }Date:  ${new Date().toString()}\n`
                           + '\n'
                           + `    ${message}\n`);
  },

  // **write()** writes `str` to the objects database.
  write(str) {
    Files.write(nodePath.join(Files.gitletPath(), 'objects', Util.hash(str)), str);
    return Util.hash(str);
  },

  // **isUpToDate()** returns true if the giver commit has already
  // been incorporated into the receiver commit.  That is, it returns
  // true if the giver commit is an ancestor of the receiver, or they
  // are the same commit.
  isUpToDate(receiverHash, giverHash) {
    return receiverHash !== undefined
        && (receiverHash === giverHash || Objects.isAncestor(receiverHash, giverHash));
  },

  // **exists()** returns true if there is an object in the database
  // called `objectHash`
  exists(objectHash) {
    return objectHash !== undefined
        && fs.existsSync(nodePath.join(Files.gitletPath(), 'objects', objectHash));
  },

  // **read()** returns the content of the object called `objectHash`.
  read(objectHash) {
    if (objectHash !== undefined) {
      const objectPath = nodePath.join(Files.gitletPath(), 'objects', objectHash);
      if (fs.existsSync(objectPath)) {
        return Files.read(objectPath);
      }
    }
  },

  // **allObjects()** returns an array of the string content of all
  // the objects in the database
  allObjects() {
    return fs.readdirSync(Files.gitletPath('objects')).map(Objects.read);
  },

  // **type()** parses `str` as an object and returns its type:
  // commit, tree or blob.
  type(str) {
    return { commit: 'commit', tree: 'tree', blob: 'tree' }[str.split(' ')[0]] || 'blob';
  },

  // **isAncestor()** returns true if `descendentHash` is a descendent
  // of `ancestorHash`.
  isAncestor(descendentHash, ancestorHash) {
    return Objects.ancestors(descendentHash).indexOf(ancestorHash) !== -1;
  },

  // **ancestors()** returns an array of the hashes of all the
  // ancestor commits of `commitHash`.
  ancestors(commitHash) {
    const parents = Objects.parentHashes(Objects.read(commitHash));
    return Util.flatten(parents.concat(parents.map(Objects.ancestors)));
  },

  // **parentHashes()** parses `str` as a commit and returns the
  // hashes of its parents.
  parentHashes(str) {
    if (Objects.type(str) === 'commit') {
      return str.split('\n')
        .filter(line => line.match(/^parent/))
        .map(line => line.split(' ')[1]);
    }
  },

  // **parentHashes()** parses `str` as a commit and returns the tree
  // it points at.
  treeHash(str) {
    if (Objects.type(str) === 'commit') {
      return str.split(/\s/)[1];
    }
  },

  // **commitToc()** takes the hash of a commit and reads the content
  // stored in the tree on the commit.  It turns that tree into a
  // table of content that maps filenames to hashes of the files'
  // content, like: `{ "file1": hash(1), "a/file2": "hash(2)" }`
  commitToc(hash) {
    return Files.flattenNestedTree(Objects.fileTree(Objects.treeHash(Objects.read(hash))));
  },
};

module.exports = Objects;
