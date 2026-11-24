#!/bin/bash
set -e
export PATH=/opt/emsdk:/opt/emsdk/upstream/emscripten:/usr/local/bin:/usr/bin:/bin
cd /home/pycat/build/gap-src

node gap.js -l '/home/pycat/build/gap-src;' -b -c 'LoadPackage("semigroups"); Print("SEMI_CHECK: ", SemigroupsTest(), "\n"); S := FullTransformationMonoid(3); Print("MONOID_SIZE: ", Size(S), "\n");'
