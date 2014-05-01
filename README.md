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

To run the end to end testing suite locally, do the following.
```bash
./test
```

Should produce something like the following.

    $ rm -rf docs* metadata*; ./test
    Testing: serialized writes, single writer
    Testing: serialized writes, multiple writers
    Testing: concurrent, nonconflicting writers
    Testing: concurrent, conflicting writers
    Testing: random concurrent updates...
    PASS

If it fails, try increasing the timeouts before checking for consistency in each test case.
The testing code isn't very DRY as well as requires fine tuning these timeouts by hand; but it does work, so that's cool.
