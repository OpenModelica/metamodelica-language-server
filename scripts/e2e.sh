#!/usr/bin/env bash

export CODE_TESTS_PATH="$(pwd)/client/out/client/src/test"
export CODE_TESTS_WORKSPACE="$(pwd)/client/testFixture"

node "$(pwd)/client/out/client/src/test/runTest"
