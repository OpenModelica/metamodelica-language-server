@echo off

set CODE_TESTS_PATH="%CD%/client/out/test"
set CODE_TESTS_WORKSPACE="%CD%/client/testFixture"

node "%CD%/client/out/test/runTest"
