package pad

//
// Paxos library, to be included in an application.
// Multiple applications will run, each including
// a Paxos peer.
//
// Manages a sequence of agreed-on values.
// The set of peers is fixed.
// Copes with network failures (partition, msg loss, &c).
// Does not store anything persistently, so cannot handle crash+restart.
//
// The application interface:
//
// px = paxos.Make(peers []string, me string)
// px.Start(seq int, v interface{}) -- start agreement on new instance
// px.Status(seq int) (decided bool, v interface{}) -- get info about an instance
// px.Done(seq int) -- ok to forget all instances <= seq
// px.Max() int -- highest instance seq known, or -1
// px.Min() int -- instances before this seq have been forgotten
//

import "net"
import "net/rpc"
import "log"

/*import "os"*/
import "syscall"
import "sync"
import "fmt"
import "math/rand"
import "math"

type Paxos struct {
	mu         sync.Mutex
	l          net.Listener
	dead       bool
	unreliable bool
	rpcCount   int
	peers      []string
	me         int // index into peers[]

	// Your data here.
	lock   sync.Mutex
	leader bool
	n      int
	v      interface{}

	// acceptance map
	A map[int]*AcceptorState

	//decision state
	decision map[int]Proposition
	doneMap  map[int]int
	max      int
	min      int
}

type AcceptorState struct {
	//acceptor state
	n_p int         //highest prepare seen
	n_a int         //highest accept seen
	v_a Proposition // highest accept value seen

}

const (
	PrepareOK   = "PrepareOK"
	PrepareNand = "PrepareReject"
	AcceptOK    = "AcceptOK"
	AcceptNand  = "AcceptReject"
	LearnOK     = "LearnOK"
)

type PrepareArgs struct {
	N        int
	Seq      int
	Peer     int
	DoneWith int
}

type PrepareReply struct {
	Status string
	N_a    int
	V_a    Proposition
}

type AcceptArgs struct {
	N   int
	Seq int
	Val Proposition
}

type AcceptReply struct {
	Status string
	N      int
	Val    Proposition
}

type LearnArgs struct {
	Seq int
	Val Proposition
}

type LearnReply struct {
	Status string
}

type MinArgs struct {
}

type MinReply struct {
	Min int
}

type Proposition struct {
	Id  int64
	Val interface{}
}

//
// call() sends an RPC to the rpcname handler on server srv
// with arguments args, waits for the reply, and leaves the
// reply in reply. the reply argument should be a pointer
// to a reply structure.
//
// the return value is true if the server responded, and false
// if call() was not able to contact the server. in particular,
// the replys contents are only valid if call() returned true.
//
// you should assume that call() will time out and return an
// error after a while if it does not get a reply from the server.
//
// please use call() to send all RPCs, in client.go and server.go.
// please do not change this function.
//
func call(srv string, name string, args interface{}, reply interface{}) bool {
	c, err := rpc.Dial("tcp", srv)
	if err != nil {
		err1 := err.(*net.OpError)
		if err1.Err != syscall.ENOENT && err1.Err != syscall.ECONNREFUSED {
			fmt.Printf("paxos Dial() failed: %v\n", err1)
		}
		return false
	}
	defer c.Close()

	err = c.Call(name, args, reply)
	if err == nil {
		return true
	}

	return false
}

func (px *Paxos) Me() string {
	return px.peers[px.me]
}

func (px *Paxos) Prepare(args *PrepareArgs, reply *PrepareReply) error {
	px.lock.Lock()
	defer px.lock.Unlock()

	//adjust map of who is done with what and clear memory if possible
	px.doneMap[args.Peer] = int(math.Max(float64(px.doneMap[args.Peer]), float64(args.DoneWith)))
	px.delete()

	state, ok := px.A[args.Seq]
	if !ok {
		state = &AcceptorState{-1, -1, Proposition{}}
	}

	if args.N > state.n_p {
		state.n_p = args.N
		reply.Status = PrepareOK
		reply.N_a = state.n_a
		reply.V_a = state.v_a
		px.A[args.Seq] = state
	} else {
		reply.Status = PrepareNand
	}

	return nil
}

func (px *Paxos) Accept(args *AcceptArgs, reply *AcceptReply) error {
	px.lock.Lock()
	defer px.lock.Unlock()

	state, ok := px.A[args.Seq]
	if !ok {
		state = &AcceptorState{-1, -1, Proposition{}}
	}

	if args.N >= state.n_p {
		state.n_p = args.N
		state.n_a = args.N
		state.v_a = args.Val
		reply.Status = AcceptOK
		reply.N = args.N
		reply.Val = args.Val
		px.A[args.Seq] = state
	} else {
		reply.Status = AcceptNand
	}

	return nil
}

func (px *Paxos) Learn(args *LearnArgs, reply *LearnReply) error {
	px.lock.Lock()
	defer px.lock.Unlock()

	px.decision[args.Seq] = args.Val
	if args.Seq > px.max {
		px.max = args.Seq
	}

	return nil
}

func (px *Paxos) Minquery(args *MinArgs, reply *MinReply) error {
	reply.Min = px.min
	return nil
}

func nrand2() int64 {
	x := rand.Int63()
	return x
}

//
// the application wants paxos to start agreement on
// instance seq, with proposed value v.
// Start() returns right away; the application will
// call Status() to find out if/when agreement
// is reached.
//
func (px *Paxos) Start(seq int, val interface{}) {
	v := Proposition{nrand2(), val}

	//proposer
	go func(seq int, v Proposition) {
		_, ok := px.decision[seq]
		px.lock.Lock()
		px.A[seq] = &AcceptorState{-1, -1, Proposition{}}
		px.lock.Unlock()
		n := px.me
		for !ok {
			//choose n, unique and higher than any n seen so far
			px.lock.Lock()
			for {
				if px.A[seq].n_p >= n {
					n += len(px.peers)
				} else {
					break
				}
			}
			px.lock.Unlock()

			// ------------------------ PREPARE -------------------------

			//send prepare(n) to all servers including self
			prepareResponseChannel := make(chan *PrepareReply, len(px.peers))
			for i := 0; i < len(px.peers); i++ {
				args := PrepareArgs{n, seq, px.me, px.doneMap[px.me]}
				reply := &PrepareReply{}
				if i == px.me {
					px.Prepare(&args, reply)

					prepareResponseChannel <- reply
				} else {
					go func(i int) {
						success := call(px.peers[i], "Paxos.Prepare", args, reply)
						if !success {
							reply.Status = PrepareNand
						}
						prepareResponseChannel <- reply
						return
					}(i)
				}
			}

			//prepare response handler
			prepareMajorityChannel := make(chan bool, len(px.peers))
			majority := false
			numReplies := 0
			numOK := 0
			highestN := -1
			value := v
			go func() {
				for numReplies < len(px.peers) {
					reply := <-prepareResponseChannel
					numReplies += 1
					if reply.Status == PrepareOK {
						numOK += 1
						if reply.N_a > highestN {
							highestN = reply.N_a
							blank := Proposition{}
							if reply.V_a.Id != blank.Id {
								value = reply.V_a
							}
						}
					}

					if numOK > len(px.peers)/2 {
						majority = true
					}
				}
				close(prepareResponseChannel)
				prepareMajorityChannel <- majority
				return
			}()

			prepareMajority := <-prepareMajorityChannel
			close(prepareMajorityChannel)

			// ------------------------ ACCEPT -------------------------

			// prepare majority achieved -> propose value
			// begin accept phase
			if prepareMajority {
				//send accept to all servers including self
				acceptResponseChannel := make(chan *AcceptReply, len(px.peers))
				for i := 0; i < len(px.peers); i++ {
					args := AcceptArgs{n, seq, value}
					reply := &AcceptReply{}
					if i == px.me {
						px.Accept(&args, reply)
						acceptResponseChannel <- reply
					} else {
						go func(i int) {
							success := call(px.peers[i], "Paxos.Accept", args, reply)
							if !success {
								reply.Status = AcceptNand
							}
							acceptResponseChannel <- reply
							return
						}(i)
					}
				}

				//accept response handler
				acceptMajorityChannel := make(chan bool, len(px.peers))
				majority := false
				numReplies := 0
				numOK := 0
				go func() {
					for numReplies < len(px.peers) {
						reply := <-acceptResponseChannel
						numReplies += 1
						if reply.Status == AcceptOK && reply.Val.Id == value.Id {
							numOK += 1
						}

						if numOK > len(px.peers)/2 {
							majority = true
						}
					}
					acceptMajorityChannel <- majority
					close(acceptResponseChannel)
					return
				}()

				acceptMajority := <-acceptMajorityChannel
				close(acceptMajorityChannel)

				// ------------------------ LEARN -------------------------
				if acceptMajority {
					//begin learn phase
					// accepted by majority
					for i := 0; i < len(px.peers); i++ {
						args := LearnArgs{seq, value}
						reply := &LearnReply{}
						if i == px.me {
							px.Learn(&args, reply)
						} else {
							go func(i int) {
								success := false
								// for !success {
								success = call(px.peers[i], "Paxos.Learn", args, reply)
								// }
								if !success {
									reply.Status = LearnOK
								}
								return
							}(i)
						}
					}

					break
				} else {
					// fmt.Println("Accept did not get majority")
				}
			} else {
				// fmt.Println("Prepare did not get majority")
			}
			_, ok = px.decision[seq]
		}
	}(seq, v)

}

//
// the application on this machine is done with
// all instances <= seq.
//
// see the comments for Min() for more explanation.
//
func (px *Paxos) Done(seq int) {
	// Your code here.
	if seq > px.min {
		px.min = seq
	}
	px.doneMap[px.me] = int(math.Max(float64(seq), float64(px.doneMap[px.me])))

	px.delete()
}

func (px *Paxos) delete() {
	px.mu.Lock()
	defer px.mu.Unlock()

	// delete only up to min in case server is partitioned
	globalMin := px.Min()
	for key := range px.A {
		if key < globalMin {
			delete(px.A, key)
		}
	}
	for key := range px.decision {
		if key < globalMin {
			delete(px.decision, key)
		}
	}
}

//
// the application wants to know the
// highest instance sequence known to
// this peer.
//
func (px *Paxos) Max() int {
	// Your code here.
	return px.max
}

//
// Min() should return one more than the minimum among z_i,
// where z_i is the highest number ever passed
// to Done() on peer i. A peers z_i is -1 if it has
// never called Done().
//
// Paxos is required to have forgotten all information
// about any instances it knows that are < Min().
// The point is to free up memory in long-running
// Paxos-based servers.
//
// Paxos peers need to exchange their highest Done()
// arguments in order to implement Min(). These
// exchanges can be piggybacked on ordinary Paxos
// agreement protocol messages, so it is OK if one
// peers Min does not reflect another Peers Done()
// until after the next instance is agreed to.
//
// The fact that Min() is defined as a minimum over
// *all* Paxos peers means that Min() cannot increase until
// all peers have been heard from. So if a peer is dead
// or unreachable, other peers Min()s will not increase
// even if all reachable peers call Done. The reason for
// this is that when the unreachable peer comes back to
// life, it will need to catch up on instances that it
// missed -- the other peers therefor cannot forget these
// instances.
//
func (px *Paxos) Min() int {
	globalMin := px.doneMap[px.me]
	for _, peerMin := range px.doneMap {
		globalMin = int(math.Min(float64(globalMin), float64(peerMin)))
	}

	return globalMin + 1
}

//
// the application wants to know whether this
// peer thinks an instance has been decided,
// and if so what the agreed value is. Status()
// should just inspect the local peer state;
// it should not contact other Paxos peers.
//
func (px *Paxos) Status(seq int) (bool, interface{}) {
	// Your code here.
	if val, ok := px.decision[seq]; ok {
		return true, val.Val
	}
	return false, nil
}

//
// tell the peer to shut itself down.
// for testing.
// please do not change this function.
//
func (px *Paxos) Kill() {
	px.dead = true
	if px.l != nil {
		px.l.Close()
	}
}

//
// the application wants to create a paxos peer.
// the ports of all the paxos peers (including this one)
// are in peers[]. this servers port is peers[me].
//
func MakePaxosInstance(peers []string, me int, rpcs *rpc.Server) *Paxos {
	px := &Paxos{}
	px.peers = peers
	px.me = me

	// Your initialization code here.
	px.doneMap = make(map[int]int)
	for i, _ := range px.peers {
		px.doneMap[i] = -1
	}
	px.decision = make(map[int]Proposition)
	px.A = make(map[int]*AcceptorState)
	px.max = -1
	px.min = -1

	if rpcs != nil {
		// caller will create socket &c
		rpcs.Register(px)
	} else {
		rpcs = rpc.NewServer()
		rpcs.Register(px)

		// prepare to receive connections from clients.
		// change "unix" to "tcp" to use over a network.
		// os.Remove(peers[me]) // only needed for "unix"
		l, e := net.Listen("tcp", peers[me])
		if e != nil {
			log.Fatal("listen error: ", e)
		}
		px.l = l

		// please do not change any of the following code,
		// or do anything to subvert it.

		// create a thread to accept RPC connections
		go func() {
			for px.dead == false {
				conn, err := px.l.Accept()
				if err == nil && px.dead == false {
					if px.unreliable && (rand.Int63()%1000) < 100 {
						// discard the request.
						conn.Close()
					} else if px.unreliable && (rand.Int63()%1000) < 200 {
						// process the request but force discard of reply.
						c1 := conn.(*net.UnixConn)
						f, _ := c1.File()
						err := syscall.Shutdown(int(f.Fd()), syscall.SHUT_WR)
						if err != nil {
							fmt.Printf("shutdown: %v\n", err)
						}
						px.rpcCount++
						go rpcs.ServeConn(conn)
					} else {
						px.rpcCount++
						go rpcs.ServeConn(conn)
					}
				} else if err == nil {
					conn.Close()
				}
				if err != nil && px.dead == false {
					fmt.Printf("Paxos(%v) accept: %v\n", me, err.Error())
				}
			}
		}()
	}

	return px
}
