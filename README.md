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

## Installation

Make sure you have `go 1.2` and `node v0.10.3` installed.

```bash
git clone https://github.com/jdhenke/pad.git
cd pad
npm install
```

## Running Locally

Use `configs/local.txt` which contains something like this:

    127.0.0.1:7080
    127.0.0.1:7081
    127.0.0.1:7082

Each line is `127.0.0.1:<port>` when running locally. See the next section for running remotely.

To run, simply do the following:

```bash
./driver configs/local.txt
```

**NOTE**: They are communicating with each other on the ports specificied in the file.
To view the webpage, simply go to any pad server on the port **1000 higher** than the port in the config file.

For `configs/local.txt`, visit any of:

* [http://localhost:8080/docs/DocID](http://localhost:8080/docs/DocID),
* [http://localhost:8081/docs/DocID](http://localhost:8081/docs/DocID)
* [http://localhost:8082/docs/DocID](http://localhost:8082/docs/DocID).

Change `DocID` to get a different document.

## Running on AWS

TODO: how to specify pem files?

## Unit Testing

TODO: git

TODO: paxos

## Integration Testing

To run the end to end testing suite locally, **restart** the local configuration as specified above, then in a separate shell run this:

```bash
./node_modules/.bin/phantomjs ./test/test-api.js
```

This spins up many headless browser clients which use Pad's Javascript API to concurrently edit a document.
It should produce something like the following.

    $ ./test
    Testing: serialized writes, single writer
    Testing: serialized writes, multiple writers
    Testing: concurrent, nonconflicting writers
    Testing: concurrent, conflicting writers
    Testing: random concurrent updates...
    PASS

> If it fails, try increasing the timeouts which happen before checking for consistency in each test case.

## Latency Testing

TODO
