#!/bin/sh

ip=$1
port=$2
user=$3
config=$4
index=$5
identity=$6

ssh -i $identity $user@$ip mkdir -p pad
scp -r -i $identity configs/ index.html js/ package.json server/ $user@$ip:~/pad/
ssh -i $identity $user@$ip "cd pad; npm install; go run server/server.go $config $index"
