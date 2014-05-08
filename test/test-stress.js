// simulate a class wide demo

/************** Adjustable Parameters **************/
var numUsers = 100;
var testDuration = 30000; // tests spamming for
/***************************************************/

var hostname = "localhost";

var http = require("http");
http.globalAgent.maxSockets = Infinity;

// mutable state of the test
var docID = "testing @ " + (+ new Date());
var totalLatency = 0;
var numCommits = 0;
var done = false;

// main
for (var i = 0; i < numUsers; i += 1) {
  var client = new Client();
  client.spam();
}

setTimeout(function() {
  done = true;
  setTimeout(function() {
    var meanLatency = parseInt(totalLatency / numCommits);
    console.log(numCommits);
    console.log("Done. Mean Latency = " + meanLatency + "ms");
    process.exit();
  }, 0);
}, testDuration);

function Client() {

  var nextDiff = 1;
  var clientID = parseInt((+ new Date()) * Math.random());
  var diff = require("../js/git.js").getDiff("", "");

  this.spam = function() {

    function doGet() {
      var options = {
        hostname: hostname,
        port: 8080,
        path: "/commits/get",
        method: 'POST',
        headers: {
          "doc-id": docID,
          "next-commit": nextDiff + 1,
          'Connection':'keep-alive',
        },
      };
      console.log("do get", clientID, nextDiff + 1);
      var req = http.request(options, function(res) {
        var commitText = "";
        res.on("data", function(chunk) {
          commitText += chunk;
        });
        res.on("end", function() {
          var commit = JSON.parse(commitText);
          // tally up latency
          totalLatency += (+ new Date()) - commit.id;
          numCommits += 1;
          // continue spamming
          nextDiff += 1;
          doGet();
          if ((commit.clientID === clientID) && !done) setTimeout(doPut, 1000);
        });
      });
      req.on("error", function(err) {
        console.log("err:", err);
        setTimeout(doGet, 5000);
      });
      req.end();
    }

    function doPut() {
      console.log("do put", clientID, nextDiff);
      var commit = {
        clientID: clientID,
        parent: nextDiff - 1,
        diff: diff,
        id: (+ new Date()),
      };
      var options = {
        method: 'POST',
        hostname: hostname,
        port: 8080,
        path: "/commits/put",
        headers: {
          "doc-id": docID,
          'Connection':'keep-alive',
        },
      };
      var req = http.request(options, function(res) {
        // do nothing;
      });
      req.on("error", function(err) {
        console.log("err:", err);
        setTimeout(doPut, 5000);
      });
      req.write(JSON.stringify(commit));
      req.end();
    }
    doGet();
    doPut();
  }
}
