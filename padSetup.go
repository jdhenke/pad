package main

import (
	"os"
	"strconv"
	"fmt"
)

func port(tag string, host int) string {
	s := "/var/tmp/824-"
	s += strconv.Itoa(os.Getuid()) + "/"
	os.Mkdir(s, 0777)
	s += "pad-"
	s += strconv.Itoa(os.Getpid()) + "-"
	s += tag + "-"
	s += strconv.Itoa(host)
	return s
}

func cleanup(kva []*PadServer) {
	for i := 0; i < len(kva); i++ {
		if kva[i] != nil {
			kva[i].kill()
		}
	}
}

func main() {
	const nservers = 3
	var kva []*PadServer = make([]*PadServer, nservers)
	var kvh []string = make([]string, nservers)

	for i := 0; i < nservers; i++ {
		kvh[i] = port("standard", i)
	}
	for i := 0; i < nservers; i++ {
		port := 8080 + i
		kva[i] = MakePadServer(strconv.Itoa(port), kvh, i)
	}
	for i := 1; i < nservers; i++ {
		go kva[i].Start()
	}
	fmt.Println("server started"); // necessary for testing client
	kva[0].Start()
}
