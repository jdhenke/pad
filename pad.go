package main

import (
	"crypto/rand"
	"encoding/gob"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"math/big"
	"net"
	"net/http"
	"net/rpc"
	"os"
	"strconv"
	"sync"
	"syscall"
	"time"
)

var _ = fmt.Printf
var _ = time.Sleep

type PadServer struct {
	mu         sync.Mutex
	l          net.Listener
	me         int
	dead       bool // for testing
	unreliable bool // for testing
	px         *Paxos

	docs         map[string]*Doc
	ppd          *PadPersistenceWorker
	peers        []string
	port         string
	lastExecuted int
}

type Doc struct {
	commits   []Commit
	mu        sync.Mutex
	listeners []chan Commit
	Id        int64
	Name      string //TODO: Make a Doc metadata structure to store doc identification
}

type Commit string

type Err string

type Op struct {
	Op   string      // Operation
	Args interface{} // Operation arguments
	Id   int64       // Operation ID
}

type PutArgs struct {
	Commit Commit
	DocId  string
}

type GetArgs struct {
	NextCommit int
	DocId      string
}

const (
	Debug = 0
	PUT   = "Put"
	GET   = "Get"
	NOOP  = "Noop"
)

func DPrintf(format string, a ...interface{}) (n int, err error) {
	if Debug > 0 {
		log.Printf(format, a...)
	}
	return
}

// Propose into latest paxos log spot and execute up to that point
func (ps *PadServer) Propose(proposal Op) bool {
	for {
		seq := ps.px.Max() + 1
		if ps.shouldPropose(proposal.Op, proposal.Args) {
			ps.px.Start(seq, proposal)
			decision := ps.WaitTillDecided(seq).(Op)
			if decision.Id == proposal.Id {
				return true // op was agreed upon and should be executed
			}
		} else {
			return false // implies the mismatch in configuration
		}
	}

	return true
}

// Given my current configuration state, should I propose?
func (ps *PadServer) shouldPropose(op string, args interface{}) bool {
	return true
}

// Interpret an operation from my paxos log and clear memory from it
func (ps *PadServer) Interpret(op Op) (Commit, Err) {
	val, err := ps.exec(op)
	ps.lastExecuted++
	ps.px.Done(ps.lastExecuted)

	return val, err
}

// Op handler and executer
func (ps *PadServer) exec(op Op) (Commit, Err) {
	var val Commit
	var err Err

	// TODO: Duplicate detection

	switch op.Op {
	case GET:
		args := op.Args.(GetArgs)
		go ps.get(args.NextCommit, args.DocId)
		break
	case PUT:
		args := op.Args.(PutArgs)
		ps.put(args.Commit, args.DocId)
		break
	}

	return val, err
}

// wait for the paxos instance to makea decision
func (ps *PadServer) WaitTillDecided(seq int) interface{} {
	to := 10 * time.Millisecond
	count := 0
	for {
		decided, val := ps.px.Status(seq)
		if decided {
			return val
		}

		// propose a noop
		count++
		if count == 7 {
			op := Op{}
			op.Op = NOOP
			op.Id = -1
			ps.px.Start(seq, op)
		}

		time.Sleep(to)
		if to < 10*time.Second {
			to *= 2
		}
	}
}

// DOC
func (ps *PadServer) NewDoc(docID string) *Doc {
	doc := &Doc{}
	doc.commits = make([]Commit, 1)
	doc.listeners = make([]chan Commit, 0)
	doc.Id = nrand()
	doc.Name = docID

	// append document identification data to metadata
	fd, _ := os.OpenFile(METADATA+ps.port+JSON, os.O_RDWR|os.O_APPEND, 0644)
	defer fd.Close()
	b, _ := json.Marshal(doc)
	fd.Write(b)
	fd.Write([]byte("\n"))

	// create doc file on disk
	os.Create("./docs" + ps.port + "/" + strconv.FormatInt(doc.Id, 10) + JSON)

	return doc
}

func (doc *Doc) getCommit(id int) Commit {
	doc.mu.Lock()
	c := make(chan Commit, 1)
	if id < len(doc.commits) {
		c <- doc.commits[id]
	} else {
		doc.listeners = append(doc.listeners, c)
	}
	doc.mu.Unlock()
	return <-c
}

func (doc *Doc) putCommit(commit Commit) {
	doc.mu.Lock()
	defer doc.mu.Unlock()
	for _, c := range doc.listeners {
		c <- commit
	}
	doc.listeners = make([]chan Commit, 0)
	doc.commits = append(doc.commits, commit)
}

// HANDLERS

func (ps *PadServer) put(commit Commit, docID string) {
	ps.mu.Lock()
	defer ps.mu.Unlock()
	doc, ok := ps.docs[docID]
	if !ok {
		ps.docs[docID] = ps.NewDoc(docID)
		doc = ps.docs[docID]
	}
	doc.putCommit(Commit(commit))
}

func (ps *PadServer) get(nextCommit int, docID string) Commit {
	ps.mu.Lock()
	doc, ok := ps.docs[docID]
	if !ok {
		ps.docs[docID] = ps.NewDoc(docID)
		doc = ps.docs[docID]
	}
	ps.mu.Unlock()
	return doc.getCommit(nextCommit)
}

func (ps *PadServer) commitPutter(w http.ResponseWriter, r *http.Request) {
	docID := r.Header.Get("doc-id")
	commit, _ := ioutil.ReadAll(r.Body)

	args := PutArgs{Commit(commit), docID}
	proposal := Op{PUT, args, nrand()}
	ps.Propose(proposal)
}

func (ps *PadServer) commitGetter(w http.ResponseWriter, r *http.Request) {
	docID := r.Header.Get("doc-id")
	nextCommit, _ := strconv.Atoi(r.Header.Get("next-commit"))
	commit := ps.get(nextCommit, docID)
	w.Write([]byte(commit))
}

func (ps *PadServer) docHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Add("Content-Type", "text/html")
	if html, err := ioutil.ReadFile("./index.html"); err == nil {
		w.Write(html)
	} else {
		panic("unknown file")
	}
}

func (ps *PadServer) kill() {
	DPrintf("Kill(%d): die\n", ps.me)
	ps.dead = true
	ps.l.Close()
	ps.px.Kill()
}

func nrand() int64 {
	max := big.NewInt(int64(1) << 62)
	bigx, _ := rand.Int(rand.Reader, max)
	x := bigx.Int64()
	return x
}

func (ps *PadServer) Start() {
	mux := http.NewServeMux()
	mux.HandleFunc("/commits/put", ps.commitPutter)
	mux.HandleFunc("/commits/get", ps.commitGetter)
	mux.HandleFunc("/docs/", ps.docHandler)
	mux.Handle("/js/", http.FileServer(http.Dir("./")))
	http.ListenAndServe(":"+ps.port, mux)
}

// PAD SERVER

func MakePadServer(port string, servers []string, me int) *PadServer {
	ps := &PadServer{}
	gob.Register(Op{})
	gob.Register(Doc{})
	gob.Register(PutArgs{})
	gob.Register(GetArgs{})
	ps.docs = make(map[string]*Doc)
	ps.port = port
	rpcs := rpc.NewServer()
	rpcs.Register(ps)

	ps.px = MakePaxosInstance(servers, me, rpcs)

	ps.ppd = MakePersistenceWorker(ps)
	ps.ppd.Start()

	ps.lastExecuted = -1

	ps.unreliable = false
	ps.dead = false

	os.Remove(servers[me])
	l, e := net.Listen("unix", servers[me])
	if e != nil {
		log.Fatal("listen error: ", e)
	}
	ps.l = l

	// please do not change any of the following code,
	// or do anything to subvert it.

	go func() {
		for ps.dead == false {
			conn, err := ps.l.Accept()
			if err == nil && ps.dead == false {
				if ps.unreliable && (nrand2()%1000) < 100 {
					// discard the request.
					conn.Close()
				} else if ps.unreliable && (nrand2()%1000) < 200 {
					// process the request but force discard of reply.
					c1 := conn.(*net.UnixConn)
					f, _ := c1.File()
					err := syscall.Shutdown(int(f.Fd()), syscall.SHUT_WR)
					if err != nil {
						fmt.Printf("shutdown: %v\n", err)
					}
					go rpcs.ServeConn(conn)
				} else {
					go rpcs.ServeConn(conn)
				}
			} else if err == nil {
				conn.Close()
			}
			if err != nil && ps.dead == false {
				fmt.Printf("Pad(%v) accept: %v\n", me, err.Error())
				ps.kill()
			}
		}
	}()

	go func() {
		for {
			seq := ps.lastExecuted + 1
			if done, val := ps.px.Status(seq); done {
				ps.Interpret(val.(Op))
			} else {
				time.Sleep(200 * time.Millisecond)
			}
		}
	}()

	return ps
}
