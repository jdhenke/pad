pad
===

## Pad Server

```bash
go run pad.go persistenceWorker.go
```

Visit [http://localhost:8080/docs/DocID](http://localhost:8080/docs/DocID). Change `DocID` to get a different document.

## Go Client/Node Server Example

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

## PhantomJS Example Tester

To run an example of how PhantomJS can be used to simulate multiple clients at the same time and that illustrates the latency of a commit, ensure your PhantomJS is installed (`npm install`) and do the following.

```bash
./test
```

Should produce something like the following.

    $ ./test
    // Spinning up Pad server and two separate clients...
    client1.setText(message @ 1398467494089)
    client2.getText() = ""
    // sleeping 1s...
    client2.getText() = "message @ 1398467494089"

See `tester.js` for details.
