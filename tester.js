// simple example illustrating the delay of commits in pad using a PhantomJS
// with multiple headless browser clients.

// entry point for our example
function main() {

  console.log("// Spinning up Pad server and two separate clients...");

  // spawn our pad server. It's built then run as its own process because if you
  // just call `go run pad.go`, phantom.exit() doesn't actually kill the server
  // process, it kills what looks like the outer process which presumably
  // compiles and calls the temporary built pad object. now, the go server
  // process is a direct child process of this tester, so exiting the tester
  // kills the server as well.
  require("child_process")
    .spawn("go", ["build",
                  "pad.go",
                  "persistenceWorker.go"])
    .on("exit", function() {
      pad = require("child_process").spawn("./pad", [])
    });

  // setup the clients
  var docID = "test-id",
      url   = "http://localhost:8080/docs/";
  setTimeout(function() { // needed for pad servers to launch
    var c1 = new PadClient(url, docID);
    setTimeout(function() { // not sure why this is necessary...
      var c2 = new PadClient(url, docID);
      setTimeout(function() { // not sure why this is necessary...
        var text = "message @ " + (+ new Date());
        console.log("client1.setText(" + text + ")");
        c1.setText(text);
        console.log("client2.getText() = \"" + c2.getText() + '"');
        console.log("// sleeping 1s...")
        setTimeout(function() { // wait for commit to propagate
          console.log('client2.getText() = "' + c2.getText() + '"');
          phantom.exit();
        }, 1000);
      }, 1000);
    }, 500);
  }, 1000);
}

// class which abstracts the notion of a pad client. encapsulates the details of
// creating a headless client, loading the page and instantiating a tester
// Javascript Pad client object.
function PadClient(url, docID) {

  // initialize testing pad client at url and doc ID
  var page = require('webpage').create();
  page.open(url, function(success) {
    if (success !== 'success') {
      throw "Failed to open webpage."
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
  });

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
}

// kick things off
main();
