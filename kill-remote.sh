#!/bin/sh

ip=$1
port=$2
user=$3
config=$4
index=$5
identity=$6
ssh -i $identity $user@$ip "pkill -f server"
