// require necessary git logic
var git = require('./js/git');

// listen
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
}).listen(7000);

function getDiffHandler(data) {
  return git.getDiff(data.a, data.b);
}

function rebaseHandler(data) {
  return git.rebase(data.d1, data.d2);
}

function applyDiffHandler(data) {
  return git.applyDiff(data.text, data.diff);
}
