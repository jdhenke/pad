// simplest possible server for pad

// TODO: dups, better regexes,

// bring in dependencies
var http = require("http"),
    url  = require("url"),
    path = require("path"),
    fs   = require("fs"),
    git  = require("./js/git.js");

// allow an "infinite" number of connections
http.globalAgent.maxSockets = Infinity;

// "cache" webpage contents
var index = fs.readFileSync("index.html");

// internal state
var docs = {};

// main handler
http.createServer(function(req, res) {
  var uri = url.parse(req.url).pathname;
  if (uri.match(/docs/)) {
    res.writeHead(200, {"Content-Type": "text/html"});
    res.end(index);
  } else if (uri.match(/get/)) {
    var docID = req.headers["doc-id"];
    var commitID = parseInt(req.headers["next-commit"]);
    get(docID, commitID, res);
  } else if (uri.match(/put/)) {
    var docID = req.headers["doc-id"];
    var commitText = "";
    req.on("data", function(chunk) {
      commitText += chunk;
    });
    req.on("end", function() {
      var commit = JSON.parse(commitText);
      put(docID, commit, res);
    });
  } else if (uri.match(/js/)) {
    var filename = path.join(process.cwd(), uri);
    fs.readFile(filename, "utf-8", function(err, file) {
      if(err) {
        res.writeHead(500, {"Content-Type": "text/plain"});
        res.write(err + "\n");
        res.end();
        return;
      }
      res.writeHead(200);
      res.write(file, "utf-8");
      res.end();
    });
  } else if (uri.match(/init/)) {
    var docID = req.headers["doc-id"];
    init(docID, res);
  } else {
    res.writeHead(404, {"Content-Type": "text/plain"});
    res.write("404 Not Found\n");
    res.end();
  }
}).listen(8080);


function get(docID, commitID, res) {
  var doc = getDoc(docID);
  if (commitID < doc.commits.length) {
    res.writeHead(200, {"Content-Type": "application/json"});
    res.end(JSON.stringify(doc.commits[commitID]));
  } else {
    doc.listeners.push(res);
  }
}

function put(docID, commit, res) {
  var doc = getDoc(docID);
  for (var i = commit.parent + 1; i < doc.commits.length; i += 1) {
    commit.diff = git.rebase(doc.commits[i].diff, commit.diff);
  }
  commit.parent = doc.commits.length - 1;
  doc.commits.push(commit);
  doc.state = git.applyDiff(doc.state, commit.diff);
  doc.listeners.forEach(function(waitingRes) {
    waitingRes.writeHead(200, {"Content-Type": "application/json"});
    waitingRes.end(JSON.stringify(commit));
  });
  doc.listeners = [];
  res.end();
}

function init(docID, res) {
  var doc = getDoc(docID);
  res.writeHead(200, {"head": doc.commits.length - 1});
  res.end(JSON.stringify(doc.state));
}

function getDoc(docID) {
  var docID = "" + docID;
  if (!(docID in docs)) {
    docs[docID] = {
      commits: [null],
      listeners: [],
      state: "",
    };
  }
  return docs[docID];
}
