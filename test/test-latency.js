// script which records the latency of a commit being propagated through every
// server in a configuration.
//
// usage: first run the configuration using driver. once it's up, you can test
// it by running `node ./test/test-latency.js $configFile` where the
// `$configFile` is the same configuration file using for driver.

// Testing Parameters
var testDuration = 5000, // how long to run the test in ms
    waitDelay = 1000,    // how long to wait at the end for commits to propagate
    sendDelay = 100;     // how long to wait between sends

// include XMLHttpRequest, just like on real web clients
var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;

// include git functionality
var git = require("../js/git.js");

// mutable state used by this test
var commits = {};
var docID = "testing @ " + (+ new Date()) // "/docs/test";
var configPath = process.argv[2];
var peers = require(require("path").resolve(configPath));
var stopping = false;

// entry point
function main() {
  console.log("Running test for " + testDuration + "ms ...");
  startListeners()
  startSenders();
  setTimeout(function() {
    console.log("Wrapping up...");
    stopping = true;
    setTimeout(analyzeResults, waitDelay)
  }, testDuration);
}

function startListeners() {
  peers.forEach(function(peer) {
    listen(peer, 1);
  });
}

function startSenders() {
  peers.forEach(function(peer) {
    send(peer, 0);
  });
}

function analyzeResults() {
  var data = [];
  var headers = ["commit id"];
  headers.push("receiver id");
  peers.forEach(function(peer) {
    headers.push("latency through: " + getWebURL(peer));
  });
  headers.push("average latency");
  headers.push("latency through receiver");
  data.push(headers);
  var sumOfAllLatencies = 0;
  var numOfAllLatencies = 0;
  for (var id in commits) {
    var lineData = [];
    var commit = commits[id];
    lineData.push(commit.id);
    lineData.push(commit.receiver);
    var totalLatency = 0;
    var numResponses = 0;
    peers.forEach(function(peer) {
      lineData.push(commit[getWebURL(peer)]);
      if (commit[getWebURL(peer)]) {
        totalLatency += commit[getWebURL(peer)];
        numResponses += 1;
        sumOfAllLatencies += commit[getWebURL(peer)];
        numOfAllLatencies += 1;
      }
    });
    lineData.push(totalLatency / numResponses);
    if (commit[commit.receiver]) {
      lineData.push(commit[commit.receiver]);
    }
    data.push(lineData.join(","));
  }
  var totalAverageLatency = Math.floor(sumOfAllLatencies / numOfAllLatencies);
  console.log("Done.", "Average Latency: " + totalAverageLatency + "ms");
  require("fs").writeFile("results.csv", data.join("\n"), process.exit);
}

function send(peer, parent) {
  var diff = git.getDiff("", "a"); // hack to always have a valid diff
  var commit = {
    clientID: 0, // only matters if using Pad Javascript Client
    parent: parent,
    diff: diff,
    id: (+ new Date()), // unique ID allows server to deduplicate requests
    receiver: getWebURL(peer),
  };

  // store commit by id, which is also conveniently the time of its creation
  commits[commit.id] = commit;

  // create function to keep trying to commit until successful.
  function sendCommit() {
    var req = new XMLHttpRequest();
    req.addEventListener("error", function() {
      console.log("error: " + this.responseText);
      setTimeout(sendCommit, 1000);
    });
    req.open("put", getWebURL(peer) + "/commits/put");
    req.setRequestHeader('doc-id', docID);
    req.send(JSON.stringify(commit));
  }
  sendCommit();
}

// establish listener, recording latency of each commit from this peer by
// modifying its entry in commits. Additionally, if this listener receives a
// commit which it previously sent, it kicks off another send. this check
// maintains a constant number of outstanding commits.
function listen(peer, nextDiff) {
  var req = new XMLHttpRequest();
  req.open("post", getWebURL(peer) + "/commits/get");
  req.setRequestHeader('doc-id', docID);
  req.setRequestHeader('next-commit', nextDiff);
  req.addEventListener("load", function() {
    var commit = JSON.parse(this.responseText);
    commits[commit.id][getWebURL(peer)] = (+ new Date()) - commit.id;
    listen(peer, nextDiff + 1);
    if (commit.receiver === getWebURL(peer)) {
      setTimeout(function() {
        if (!stopping) send(peer, nextDiff);
      }, sendDelay);
    }

  });
  req.addEventListener("error", function() {
    console.log("error:", this.responseText);
    listen(peer, nextDiff);
  });
  req.send();
}

// parse peer entry in config to get web URL for peer
function getWebURL(peer) {
  var webPort = parseInt(peer.port) + 1000;
  return "http://" + peer.ip + ":" + webPort;
}

// run it
if (require.main === module) {
  main();
}
