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
