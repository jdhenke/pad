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

Make sure you have `go 1.2` and `node v0.10.3` installed. Then do the following.

```bash
git clone https://github.com/jdhenke/pad.git
cd pad
npm install
```

## Running Locally

```bash
./driver configs/local.json
```

**NOTE:** They are communicating with each other on the ports specified in the file.
To view the webpage, simply go to any pad server on the port **1000 higher** than the port in the config file.

So, you can visit any of:

* [http://localhost:8080/docs/DocID](http://localhost:8080/docs/DocID),
* [http://localhost:8081/docs/DocID](http://localhost:8081/docs/DocID)
* [http://localhost:8082/docs/DocID](http://localhost:8082/docs/DocID).

The servers coordinate to all serve the same information. Change `DocID` to get a different document.

## Running on AWS

Talk w/ Joe to get the identity files and put them in `./keys/`. Then run:

```bash
<<<<<<< Updated upstream
chmod 400 keys/jdh-aws-box.pem
./driver configs/aws.json
=======
./driver configs/aws3.json
>>>>>>> Stashed changes
```

Then you can visit any of:

TODO:

**NOTE:** The pad servers will keep going on the remote machines if you kill the local `driver`.
To stop them, run the driver command but append `kill`:

```bash
./driver configs/aws.json kill
```
There are two other aws configuration files in `./configs`. They require
Evan and Marcel's identity files as well.

## Unit Testing

TODO: git

## Integration Testing

To run the end to end testing suite locally, run the local configuration as specified above, then in a separate shell run this:

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
