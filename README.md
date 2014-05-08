Pad
===

## Abstract

Team: Joe Henke, Marcel Polanco, Evan Wang

This is the repo for our 6.824 Final Project at MIT for Spring 2014.

We have created a web-based, collaborative plain text document editor.
The website is served by a group of servers which communicate via paxos and concurrent modifications to documents are handled via git-style rebasing with automatic conflict resolution. This repo allows you to deploy Pad locally as well on AWS. This repo also contains unit, integration and latency tests for Pad.

Read on to learn how to use Pad.

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

Killing the driver will kill the local pad servers.

## Running on AWS

Email us to get our identity files and put them in `./keys/`. Then run:

```bash
./driver configs/aws3.json
```

Then you can visit any of:

* [http://54.187.189.229:8080/docs/DocID](http://54.187.189.229:8080)
* [http://54.186.200.121:8081/docs/DocID](http://54.186.200.121:8081)
* [http://54.186.238.234:8082/docs/DocID](http://54.186.238.234:8082)

Again, change `DocID` to get a different document.

**NOTE:** The pad servers will keep going on the remote machines even if you kill the local `driver`.
To stop them, run the driver command with an extra `kill` option:

```bash
./driver configs/aws3.json kill
```

## Unit Testing

To run the unit tests for our conflict resolution library, which we've termed `git` due to their similarities, run the following:

```bash
node ./test/test-git.js
```

This should present something like the following.

    $ node ./test/test-git.js
    ********** testGetAndApplyDiff **********
    Basic tests passed
    Performance tests: 290ms
    All applyDiff tests passed.
    ********** testRebase *********
    Basic tests passed
    Edge case tests passed
    All rebase tests passed.

## Integration Testing

To run the end to end testing suite locally, run the local configuration as specified above, then in a separate shell run this:

```bash
./node_modules/.bin/phantomjs ./test/test-api.js
```

This spins up many headless browser clients via [PhantomJS](http://phantomjs.org/) which use Pad's Javascript API to concurrently edit a document.
It should produce something like the following.

    $ ./node_modules/.bin/phantomjs ./test/test-api.js
    Testing: serialized writes, single writer
    Testing: serialized writes, multiple writers
    Testing: concurrent, nonconflicting writers
    Testing: concurrent, conflicting writers
    Testing: random concurrent updates...
    PASS

If it fails, try increasing the timeouts - this test is not about speed and sometimes PhantomJS can be very slow, producing seemingly incorrect results, when in fact its still processing updates.

## Latency Testing

To run latency testing, run any configuration using `driver` as specified above. Once running, separately run the following with `$configFile` as the config file used with `driver`.

```bash
node ./test/test-latency.js $configFile
```

This should produce something like the following.

    $ node ./test/test-latency.js configs/local.json
    Simulating clients...
    Waiting for latest commits to propagate...
    Done. Average Latency: 103ms
    $

Additionally, it creates a spreadsheet, `results.csv`, with info about each commit.


    $ head -n 10 results.csv
    commit id,receiver id,latency through: http://127.0.0.1:8080,latency through: http://127.0.0.1:8081,latency through: http://127.0.0.1:8082,average latency,latency through receiver
    1399416486225,http://127.0.0.1:8082,63,48,50,53.666666666666664,50
    1399416486372,http://127.0.0.1:8082,117,102,101,106.66666666666667,101
    1399416486373,http://127.0.0.1:8081,118,102,102,107.33333333333333,102
    1399416486388,http://127.0.0.1:8080,104,89,88,93.66666666666667,104
    1399416486573,http://127.0.0.1:8082,121,105,104,110,104
    1399416486575,http://127.0.0.1:8081,120,105,104,109.66666666666667,105
    1399416486594,http://127.0.0.1:8080,102,87,87,92,102
    1399416486777,http://127.0.0.1:8082,120,105,103,109.33333333333333,103
    1399416486781,http://127.0.0.1:8081,118,103,102,107.66666666666667,103
