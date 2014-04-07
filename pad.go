package main

import (
	"fmt"
	"io/ioutil"
	"net/http"
	"strconv"
	"sync"
)

type PadServer struct {
	diffs []Diff
	mu    sync.Mutex
}

// going to start with all processing done on the client side. this is going to
// be stringified javascript to start. actually, probably just going to be the
// document.
type Diff []byte

func MakePadServer() *PadServer {
	ps := &PadServer{}
	ps.diffs = make([]Diff, 1)
	return ps
}

func (ps *PadServer) diffPutter(w http.ResponseWriter, r *http.Request) {
	ps.mu.Lock()
	defer ps.mu.Unlock()

	// body of request is going to be the diff
	if diff, err := ioutil.ReadAll(r.Body); err == nil {
		ps.diffs = append(ps.diffs, diff)
	} else {
		panic("unhandled error")
	}
}

func (ps *PadServer) diffGetter(w http.ResponseWriter, r *http.Request) {
	ps.mu.Lock()
	defer ps.mu.Unlock()
	body, err := ioutil.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "couldn't parse body", http.StatusBadRequest)
		return
	}
	fmt.Printf("serving %v\n", string(body))
	if v, err := strconv.Atoi(string(body)); err == nil {
		if v < 0 {
			http.Error(
				w,
				fmt.Sprintf("version number %v < 0", v),
				http.StatusBadRequest,
			)
		} else if v >= len(ps.diffs) {
			http.Error(
				w,
				fmt.Sprintf("version number %v > max %v", v, len(ps.diffs) - 1),
				http.StatusBadRequest,
			)
		} else {
			w.Write(ps.diffs[v])
		}
	}
}

func (ps *PadServer) docHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Add("Content-Type", "text/html")
	if html, err := ioutil.ReadFile("./index.html"); err == nil {
		w.Write(html)
	} else {
		panic("unknown file")
	}
}

func (ps *PadServer) Start() {
	http.HandleFunc("/diffs/put", ps.diffPutter)
	http.HandleFunc("/diffs/get", ps.diffGetter)
	http.HandleFunc("/docs/", ps.docHandler)
	http.ListenAndServe(":8080", nil)
}

func main() {
	ps := MakePadServer();
	ps.Start();
}
