package main

import (
	"./pad"
	"fmt"
	"io/ioutil"
	"os"
	"strconv"
	"strings"
)

// entry point for starting server
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
