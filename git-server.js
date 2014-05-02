// node server which provides endpoints to perform git utility function logic
// for a client. basically, git RPC. runs on 7000 right now.

// require necessary git logic
var git = require('./js/git');

// listen
var port = parseInt(process.argv[2]);
if (isNaN(port)) {
  throw "Invalid port";
}
require('http').createServer(function(req, res) {

  // aggregate incoming data
  var body = "";
  req.on("data", function(chunk) {
    body += chunk;
  });

  // once all data is in, parse it and process it based on the url
  req.on("end", function() {
    var path = require('url').parse(req.url).pathname;
    try {
      var data = JSON.parse(body);
      var reply = JSON.stringify({
        "/getDiff": getDiffHandler,
        "/rebase": rebaseHandler,
        "/applyDiff": applyDiffHandler,
      }[path](data));
      res.end(reply);
    } catch (er) {
      // bad URL/JSON
      res.statusCode = 400;
      return res.end('error: ' + er.message + "\n");
    }
  })
}).listen(port);

function getDiffHandler(data) {
  return git.getDiff(data.a, data.b);
}

function rebaseHandler(data) {
  var newDiff = git.rebase(data.c1.diff, data.c2.diff);
  data.c2.diff = newDiff;
  data.c2.parent += 1;
  return data.c2;
}

function applyDiffHandler(data) {
  return git.applyDiff(data.text, data.diff);
}
