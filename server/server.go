package main

import (
	"./pad"
	"fmt"
	"io/ioutil"
	"os"
	"strconv"
	"strings"
)

// entry point for starting a single pad server. it expects the first argument
// to be a configuration file with each line as the IP:port of each of its
// peers. the second argument is its index in that list.
//
// Note: the port in the file is the port which paxos communicates over.  the
// port + 1000 is the port the webpages are being served on and the port - 1000
// is the port the local node server is listening on.
func main() {
	if len(os.Args) != 3 {
		fmt.Println("Incorrect number of arguments.")
	} else {
		me, _ := strconv.Atoi(os.Args[2])
		fname := os.Args[1]
		if data, err := ioutil.ReadFile(fname); err == nil {
			peers := strings.Split(strings.TrimSpace(string(data)), "\n")
			server := pad.MakePadServer(peers, me)
			server.Start()
		} else {
			fmt.Println("Error reading config file", err)
		}
	}
}
