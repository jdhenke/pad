Pad
===

## Abstract

Team: Joe Henke, Marcel Polanco, Evan Wang

This is the repo for our 6.824 Final Project at MIT for Spring 2014.

Our goals are to create a plain text editor on the web which is

* collaborative
* fault tolerant
* low latency

Here's the quick summary of our system.
We use a group of Go servers as a backend.
They each serve a simple webpage, communicate via Paxos for consistency and store the state of each document to disk for persistence.
Each webpage utilizes the Pad Javascript API to communicate with the backend.
Each Javascript client communicates with the server serving its webpage.
The Javascript client sends new updates to the server via XMLHttpRequests and allows the server to push updates via long polling.
Concurrent edits are resolved through git style rebasing with automatic conflict resolution.

In addition to the system itself, this repo includes its testing infrastructure.
It uses PhantomJS to simulate many clients, testing for eventual consistency amongst clients as well as latency in normal conditions and under failures.

## Usage

### Pad Server

To Run:
```bash
go run p*.go
```
Cleanup:
```bash
rm -rf docs* metadata*
```

Visit [http://localhost:8080/docs/DocID](http://localhost:8080/docs/DocID). Change `DocID` to get a different document.

### Go Client/Node Server Example

To run the node server and a sample go client, do the following

```bash
node app.js 7000 & pid=$! ; go run client.go ; kill -s 9 $pid
```

Should produce something like the following:


    $ node app.js & pid=$! ; go run client.go ; kill -s 9 $pid
    [1] 14913
    Start: "joe henke"
    User A: "joseph henke"
    User B: "joe dalton henke"
    Rebasing B's changes onto A's reveals this progression:
    	 "joe henke"
    	 "joseph henke"
    	 "joseph dalton henke"
    [1]+  Killed: 9               node app.js

### PhantomJS Example Tester

To run an example of how PhantomJS can be used to simulate multiple clients at the same time and that illustrates the latency of a commit, ensure your PhantomJS is installed (`npm install`) and do the following.

```bash
./test
```

Should produce something like the following.

    $ ./test
    // Spinning up Pad server and two separate clients...
    client1.setText(message @ 1398601301557)
    client2.getText() = ""
    // sleeping 1s...
    client2.getText() = "message @ 1398601301557"
    Commit Latency for Client 1: 4 (ms)
    Commit Latency for Client 2: 5 (ms)

See `tester.js` for details.
