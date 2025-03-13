@echo off

set CODE_TESTS_PATH="%CD%/client/out/client/src/test"
set CODE_TESTS_WORKSPACE="%CD%/client/testFixture"

node "%CD%/client/out/client/src/test/runTest"
