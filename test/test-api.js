// end-to-end correctness testing

// helpful tool for chaining callback functions
var async = require('async');

// main entry point - start the go server and run the tests one by one, failing
// immediately if any of them fail.
function main() {
  // require("child_process").spawn("./driver", ["configs/local.txt"]);
  setTimeout(function() {
    async.series([
      testSingleWriter,
      testSerializedMultipleWriters,
      testConcurrentNoConflicts,
      testConcurrentConflicts,
      testRandom,
    ], function(err, results) {
      if (err) {
        console.log("FAIL: ", err);
        phantom.exit(1);
      } else {
        console.log("PASS")
        phantom.exit(0);
      }
    });
  }, 2000);
}

// spawns numClients PadClient objects. calls ret(err, clients)
function spawnClients(numClients, ret) {

  // new doc ID to separate tests from eachother
  var docID = "testing-id-" + (+ new Date());

  // offset from 8080 so clients are evenly distributed across paxos peers
  var portDelta = 0;

  // keeps trying to create a pad client and calls cb(client) when done.
  function spawnClient(cb) {
    portDelta = (portDelta + 1) % 3 // TODO: adjust to be num servers
    var port = 8080 + portDelta;
    var url = "http://localhost:" + port + "/docs";
    var client = new PadClient(url, docID, function(err, data) {
      if (err == null) {
        cb(null, client);
      } else {
        // this is the error case. this could happen because PhantomJS is weird.
        // if that's the case, simply toss this client and try, try again.
        client.close();
        spawnClient(cb);
      }
    });
  };

  // assemble list of tasks where each is to spawn a client
  var tasks = [];
  for (var i = 0; i < numClients; i += 1) {
    tasks.push(spawnClient);
  }

  // execute that task. assign clients to this chain's context
  var that = this;
  // parallel doesn't work for some reason... see
  // https://github.com/ariya/phantomjs/issues/11408. so this would be better
  // written as a normal iteration, but maybe one day parallel creation of
  // clients will work...
  async.series(tasks, function(err, results) {
    that.clients = results;
    ret(err, results);
  });

};

// test case where there are multiple clients. only the first client writes
// anything, and after each write, the test waits for the commit to propagate
// then checks that every client has the same state, which is text which the
// first client most recently committed.
function testSingleWriter(ret) {

  console.log("Testing: serialized writes, single writer");

  var numClients = 10,
      numChecks = 10,
      pause = 500;

  spawnClients(numClients, function(err, clients) {
    var doCheck = function() {
      text = "testing @ " + (+ new Date());
      clients[0].setText(text);
      setTimeout(function() {
        for (var i = 0; i < numClients; i += 1) {
          var clientText = clients[i].getText();
          if (clientText !== text) {
            ret("client " + i + " had " + clientText + ", not " + text);
            return;
          }
        }
        numChecks -= 1;
        if (numChecks > 0) {
          doCheck();
        } else {
          // cleanup clients
          for (var i = 0; i < numClients; i += 1) {
            clients[i].close();
          }
          // finally return success
          ret(null, 'success');
        }
      }, pause);
    };
    doCheck();
  });

};

// same as testSingleWriter, except at each round, a different client writes.
function testSerializedMultipleWriters(ret) {

  console.log("Testing: serialized writes, multiple writers");

  var numClients = 10,
      numChecks = 10, // should be the same as numClients
      pause = 500;

  spawnClients(numClients, function(err, clients) {
    var doCheck = function() {
      text = "testing @ " + (+ new Date());
      clients[numChecks - 1].setText(text);
      setTimeout(function() {
        for (var i = 0; i < numClients; i += 1) {
          var clientText = clients[i].getText();
          if (clientText !== text) {
            ret("client " + i + " had " + clientText + ", not " + text);
          }
        }
        numChecks -= 1;
        if (numChecks > 0) {
          doCheck();
        } else {
          // cleanup clients
          for (var i = 0; i < numClients; i += 1) {
            clients[i].close();
          }
          // finally return success
          ret(null, 'success');
        }
      }, pause);
    };
    doCheck();
  });

};

// in this test, multiple clients write concurrent but non-conflicting updates.
// this is made explicit by first pausing all clients, setting their text, then
// unpausing them so the changes can propagate, waiting for them to propagate,
// then testing to ensure all clients have the same state.
function testConcurrentNoConflicts(ret) {

  console.log("Testing: concurrent, nonconflicting writers");

  var numClients = 10,
      numChecks = 1, // should be <= numClients
      pause = 10000; // requires much longer wait due to rebasing

  spawnClients(numClients, function(err, clients) {
    var doCheck = function() {
      // pause clients so they don't immediately propagate their changes.
      clients.forEach(function(client) {
        client.pause();
      });
      // have each client make changes. since they are paused, it is as if they
      // are all happening at the same time. record what their text should be to
      // double check their text has not progressed.
      var expectedTexts = [];
      clients.forEach(function(client, i) {
        var text = client.getText();
        var lines = text.split("\n");
        lines[i] += i;
        var newText = lines.join("\n");
        expectedTexts.push(newText);
        client.setText(newText);
      });
      // unpause each client, first check to make sure their current text hasn't
      // changed. if it had, then pause is not working correctly.
      clients.forEach(function(client, i) {
        var text = client.getText();
        if (text !== expectedTexts[i]) {
          ret("client " + i + " jumped: " + expectedTexts[i] + " to " + text);
          return;
        }
        client.play();
      });
      // wait for all changes to propagate
      setTimeout(function() {
        // use the text of the first client as a starting point, but really they
        // just all need to be the same.
        var text = clients[0].getText();
        for (var i = 0; i < numClients; i += 1) {
          var clientText = clients[i].getText();
          if (clientText !== text) {
            ret("client " + i + " had " + clientText + ", not " + text);
            return;
          }
        }
        numChecks -= 1;
        if (numChecks > 0) {
          doCheck();
        } else {
          // cleanup clients
          for (var i = 0; i < numClients; i += 1) {
            clients[i].close();
          }
          // finally return success
          ret(null, 'success');
        }
      }, pause);
    };
    // the state will be a line per client, and each client only modifies its
    // line. this way, no updates are conflicting.
    var startStateArray = [];
    while (startStateArray.length < numClients - 1) {
      startStateArray.push("\n");
    }
    var startState = startStateArray.join("");
    clients[0].setText(startState);
    setTimeout(doCheck, pause);
  });

};

// this tests many client making concurrent updates, made to be explictly
// conflicting via pause/play.
function testConcurrentConflicts(ret) {

  console.log("Testing: concurrent, conflicting writers");

  var numClients = 10,
      numChecks = 1, // should be <= numClients
      pause = 10000; // requires much longer wait due to rebasing

  spawnClients(numClients, function(err, clients) {
    var doCheck = function() {
      // pause clients so they don't immediately propagate their changes.
      clients.forEach(function(client) {
        client.pause();
      });
      // have each client make changes. since they are paused, it is as if they
      // are all happening at the same time. record what their text should be to
      // double check their text has not progressed.
      var expectedTexts = [];
      clients.forEach(function(client, i) {
        var text = client.getText();
        var lines = text.split("\n");
        // adjust lines within a range, so overlap with other clients conflict.
        lines[i] += i;
        if (i + 1 < lines.length) {
          lines[i + 1] += i;
        } else if (i - 1 >= 0) {
          lines[i - 1] += i;
        }
        var newText = lines.join("\n");
        expectedTexts.push(newText);
        client.setText(newText);
      });
      // unpause each client, first check to make sure their current text hasn't
      // changed. if it had, then pause is not working correctly.
      clients.forEach(function(client, i) {
        var text = client.getText();
        if (text !== expectedTexts[i]) {
          ret("client " + i + " jumped: " + expectedTexts[i] + " to " + text);
          return;
        }
        client.play();
      });
      // wait for all changes to propagate
      setTimeout(function() {
        // use the text of the first client as a starting point, but really they
        // just all need to be the same.
        var text = clients[0].getText();
        for (var i = 0; i < numClients; i += 1) {
          var clientText = clients[i].getText();
          if (clientText !== text) {
            ret("client " + i + " had " + clientText + ", not " + text);
            return;
          }
        }
        numChecks -= 1;
        if (numChecks > 0) {
          doCheck();
        } else {
          // cleanup clients
          for (var i = 0; i < numClients; i += 1) {
            clients[i].close();
          }
          // finally return success
          ret(null, 'success');
        }
      }, pause);
    };
    // the state will be a line per client, and each client only modifies its
    // line. this way, no updates are conflicting.
    var startStateArray = [];
    while (startStateArray.length < numClients - 1) {
      startStateArray.push("\n");
    }
    var startState = startStateArray.join("");
    clients[0].setText(startState);
    setTimeout(doCheck, pause);
  });
}

// tests in bursts of 5s on, 5s off, making random, concurrent, potentially
// conflicting edits. after the 5s off, consistency amongst all clients is
// confirmed.
function testRandom(ret) {

  console.log("Testing: random concurrent updates...");

  var numClients = 5,
      numChecks = 1, // should <= numClients
      period = 10000, // requires much longer wait due to rebasing
      docSize = 20;

  function doRound(clients, done) {
    // 5s of doing work
    (function doLoop() {
      clients.forEach(function(client) {
        client.pause();
      })
      clients.forEach(function(client, index) {
        var text = client.getText();
        if (text.length < docSize) {
          // do insert
          var toInsert = "" + parseInt(Math.random() * numClients);
          var i = parseInt(Math.random() * text.length);
          var newText = text.substring(0, i) + toInsert + text.substring(i);
          client.setText(newText);
        } else {
          var i = parseInt(Math.random() * text.length);
          var j = i + parseInt(3 * Math.random());
          var newText = text.substring(0, i) + text.substring(j);
          client.setText(newText);
        }
      });
      clients.forEach(function(client) {
        client.play();
      })
      setTimeout(function() {
        var text = clients[0].getText();
        for (var i = 0; i < numClients; i += 1) {
          var clientText = clients[i].getText();
          if (clientText !== text) {
            ret("client " + i + " had \n" + clientText + "\n\tnot\n" + text);
            return;
          }
        }
        done();
      }, period)
    })();
  }

  spawnClients(numClients, function(err, clients) {
    var check = 0;
    function checkDoRound() {
      if (check < numChecks) {
        check += 1
        doRound(clients, checkDoRound);
      } else {
        ret();
      }
    }
    checkDoRound();
  });

}

// class which abstracts the notion of a pad client. encapsulates the details of
// creating a headless client, loading the page and instantiating a tester
// Javascript Pad client object.
function PadClient(url, docID, cb) {

  // initialize testing pad client at url and doc ID
  var page = require('webpage').create();
  page.onConsoleMessage = function(msg) {
    console.log("Client Console:", msg);
  };
  page.open(url, function(success) {
    if (success !== 'success') {
      cb("Failed to open webpage.")
    }
    page.evaluate(function(docID) {
      // define bind; apparently PhantomJS doesn't support this?
      if (!Function.prototype.bind) {
        Function.prototype.bind = function (oThis) {
          if (typeof this !== "function") {
            // closest thing possible to the ECMAScript 5 internal IsCallable function
            throw new TypeError("Function.prototype.bind - what is trying to be bound is not callable");
          }

          var aArgs = Array.prototype.slice.call(arguments, 1),
              fToBind = this,
              fNOP = function () {},
              fBound = function () {
                return fToBind.apply(this instanceof fNOP && oThis
                                       ? this
                                       : oThis,
                                     aArgs.concat(Array.prototype.slice.call(arguments)));
              };

          fNOP.prototype = this.prototype;
          fBound.prototype = new fNOP();

          return fBound;
        };
      }
      // set up pad
      if (typeof Pad === 'undefined') {
        throw "Pad undefined...";
      }
      var myState = {
        text: "",
        selectionStart: 0,
        selectionEnd: 0,
      }
      var pad = new Pad({
        getState: function() {
          return myState;
        },
        setState: function(newState) {
          myState = newState;
        },
        docID: docID,
      });
      window.pad = pad;
    }, docID);
    cb();
  });

  // executes f on the webpage
  this.evaluate = function(f) {
    return page.evaluate(f);
  }

  // get this pad client's text
  this.getText = function() {
    return page.evaluate(function() {
      return pad.getState().text;
    });
  }

  // set this pad client's value and commits
  this.setText = function(newText) {
    page.evaluate(function(newText) {
      var state = pad.getState();
      state.text = newText;
      pad.setState(state);
      pad.tryCommit();
    }, newText);
  }

  this.pause = function() {
    page.evaluate(function() {
      pad.pause();
    });
  }

  this.play = function() {
    page.evaluate(function() {
      pad.play();
    });
  }

  this.close = function() {
    page.close();
  }
}

main();
