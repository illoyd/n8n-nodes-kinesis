#!/bin/sh

# These dynamodb tables are needed for Spring Boot Cloud Data
awslocal dynamodb create-table \
--table-name lifion-kinesis-state \
--attribute-definitions AttributeName=consumerGroup,AttributeType=S AttributeName=streamName,AttributeType=S \
--key-schema AttributeName=consumerGroup,KeyType=HASH AttributeName=streamName,KeyType=RANGE \
--provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
--tags Key=Owner,Value=localstack

# Create your kinesis streams here for local development purposes
#awslocal kinesis create-stream --stream-name connection-applications-v1-local --shard-count  1
awslocal kinesis create-stream --stream-name test-stream --shard-count  1

# Debug information
awslocal dynamodb list-tables
awslocal kinesis list-streams

# Example messages
# awslocal kinesis put-record --partition-key 123 --stream-name test-stream --data 'eyJtZXNzYWdlIjoiaGVsbG8ifQ=='
