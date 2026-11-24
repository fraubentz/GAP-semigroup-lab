#!/usr/bin/env bash
set -euxo pipefail

export PATH="/opt/emsdk:/opt/emsdk/upstream/emscripten:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
source /opt/emsdk/emsdk_env.sh

BASEDIR="$HOME/build/gap-src"
cd "$BASEDIR"
JOBS=$(nproc 2>/dev/null || echo 4)

AUX_BUILD="$BASEDIR/extern/emscripten/build"
AUX_PREFIX="$BASEDIR/extern/emscripten/install"
mkdir -p "$AUX_BUILD" "$AUX_PREFIX"

# Copy host-generated files from native-build
cp native-build/build/c_*.c native-build/build/ffdata.* src/

# Build GMP for wasm (32-bit)
mkdir -p "$AUX_BUILD/gmp"
cd "$AUX_BUILD/gmp"
if [[ ! -f Makefile ]]; then
    CC_FOR_BUILD=/usr/bin/gcc ABI=standard \
    emconfigure "$BASEDIR/extern/gmp/configure" \
        --build i686-pc-linux-gnu --host none \
        --disable-assembly --enable-cxx \
        --prefix="$AUX_PREFIX"
fi
emmake make -j"$JOBS"
emmake make install

# Build zlib for wasm (static)
mkdir -p "$AUX_BUILD/zlib"
cd "$AUX_BUILD/zlib"
if [[ ! -f Makefile ]]; then
    emconfigure "$BASEDIR/extern/zlib/configure" --static --prefix="$AUX_PREFIX"
fi
emmake make -j"$JOBS"
emmake make install

# Configure GAP for wasm
cd "$BASEDIR"
if [[ ! -f GNUmakefile ]] || ! grep -q '/emcc' GNUmakefile; then
    rm -rf build ffgen
    emconfigure ./configure ABI=32 \
        --with-gmp="$AUX_PREFIX" \
        --with-zlib="$AUX_PREFIX" \
        PTHREAD_CFLAGS=" " PTHREAD_LIBS=" " \
        LDFLAGS="-s ASYNCIFY=1 -O2"
fi

# Generate version.h and config.h
emmake make build/version.h build/config.h

# Build io package static object
IO_OBJ=""
if [[ -d pkg/io ]]; then
    IO_PKG="$BASEDIR/pkg/io"
    chmod +x "$IO_PKG/configure" "$IO_PKG/autogen.sh" 2>/dev/null || true
    (
        cd "$IO_PKG"
        [[ -f configure ]] || ./autogen.sh
        emconfigure ./configure --with-gaproot="$BASEDIR" || true
    )
    emcc -m32 -c "$IO_PKG/src/io.c" -o "$AUX_BUILD/io.o" \
        -DInit__Dynamic=Init__io \
        -Isrc -Ibuild -Isrc/extra \
        -I"$IO_PKG/gen" -I"$IO_PKG/src" \
        -I"$AUX_PREFIX/include" \
        -fPIC -fno-strict-aliasing -O2
    python3 etc/emscripten/register_static_module.py io src/compstat.c
    IO_OBJ="$AUX_BUILD/io.o"
fi

# Build semigroups package static library and objects
SEMIGROUPS_OBJ=""
if [[ -d pkg/semigroups ]]; then
    SEMI_PKG="$BASEDIR/pkg/semigroups"
    SEMI_BUILD="$AUX_BUILD/semigroups"
    mkdir -p "$SEMI_BUILD"

    # Configure & build libsemigroups if not already built
    if [[ ! -f "$SEMI_PKG/libsemigroups/.libs/libsemigroups.a" ]]; then
        (
            cd "$SEMI_PKG/libsemigroups"
            emconfigure ./configure --host=none --enable-static --disable-shared \
                --disable-hpcombi --disable-backward --disable-popcnt \
                CXXFLAGS="-O2 -m32 -std=c++17 -fPIC" CFLAGS="-O2 -m32 -fPIC"
            emmake make -j"$JOBS"
        )
    fi

    # Ensure headers gen/pkgconfig.h and src/semigroups-config.hpp exist
    mkdir -p "$SEMI_PKG/gen"
    cat > "$SEMI_PKG/gen/pkgconfig.h" << 'EOF'
#define HAVE_CXX17 1
#define HAVE___BUILTIN_UNREACHABLE 1
#define HAVE_PTHREAD 1
#define HAVE_LIBPTHREAD 1
EOF

    cat > "$SEMI_PKG/src/semigroups-config.hpp" << 'EOF'
#ifndef SEMIGROUPS_CONFIG_HPP
#define SEMIGROUPS_CONFIG_HPP
#define SEMIGROUPS_HAVE_CXX17 1
#define SEMIGROUPS_HAVE___BUILTIN_UNREACHABLE 1
#define SEMIGROUPS_HAVE_PTHREAD 1
#define SEMIGROUPS_HAVE_LIBPTHREAD 1
#endif
EOF

    # Compile semigroups C++ source files
    KEXT_SOURCES=(
        src/bipart.cpp
        src/conglatt.cpp
        src/froidure-pin-fallback.cpp
        src/isomorph.cpp
        src/pkg.cpp
        src/to-gap.cpp
        src/init-cong.cpp
        src/init-froidure-pin-base.cpp
        src/init-froidure-pin-bipart.cpp
        src/init-froidure-pin-bmat.cpp
        src/init-froidure-pin-matrix.cpp
        src/init-froidure-pin-max-plus-mat.cpp
        src/init-froidure-pin-min-plus-mat.cpp
        src/init-froidure-pin-pbr.cpp
        src/init-froidure-pin-pperm.cpp
        src/init-froidure-pin-transf.cpp
        src/init-presentation.cpp
        src/init-sims.cpp
        src/init-to-congruence.cpp
        src/init-to-froidure-pin.cpp
        src/init-todd-coxeter.cpp
        gapbind14/src/gapbind14.cpp
    )

    SEMI_OBJS=()
    for src_file in "${KEXT_SOURCES[@]}"; do
        base_name=$(basename "$src_file" .cpp)
        obj_file="$SEMI_BUILD/${base_name}.o"
        if [[ ! -f "$obj_file" ]]; then
            echo "Compiling $src_file -> $obj_file"
            em++ -m32 -std=gnu++17 -O2 -fPIC -fno-strict-aliasing \
                -DInit__Dynamic=Init__semigroups \
                -I"$BASEDIR/src" -I"$BASEDIR/build" -I"$BASEDIR/src/extra" \
                -I"$AUX_PREFIX/include" \
                -I"$SEMI_PKG/src" -I"$SEMI_PKG/gen" -I"$SEMI_PKG/gapbind14/include" \
                -I"$SEMI_PKG/libsemigroups/include" \
                -I"$SEMI_PKG/libsemigroups/include/libsemigroups" \
                -I"$SEMI_PKG/libsemigroups/third_party/fmt-11.1.4/include" \
                -I"$SEMI_PKG/libsemigroups/third_party/eigen-5.0.1" \
                -I"$SEMI_PKG/libsemigroups/third_party/magic_enum-0.9.7/include" \
                -I"$SEMI_PKG/libsemigroups/third_party/rx-ranges/include" \
                -c "$SEMI_PKG/$src_file" -o "$obj_file"
        fi
        SEMI_OBJS+=("$obj_file")
    done

    # Unpack libsemigroups.a so all its objects are directly included
    mkdir -p "$SEMI_BUILD/libsemigroups_objs"
    (cd "$SEMI_BUILD/libsemigroups_objs" && emar x "$SEMI_PKG/libsemigroups/.libs/libsemigroups.a")
    rm -f "$AUX_BUILD/libsemigroups_kernel.a"
    emar rcs "$AUX_BUILD/libsemigroups_kernel.a" "${SEMI_OBJS[@]}" "$SEMI_BUILD/libsemigroups_objs"/*.o
    python3 etc/emscripten/register_static_module.py semigroups src/compstat.c
    SEMIGROUPS_OBJ="$AUX_BUILD/libsemigroups_kernel.a"
fi

# Build file list that will be served
find -L pkg lib grp tst doc hpcgap dev benchmark -type f ! -path 'pkg/log/*' \
        ! -path '*/.git/*' \
    | python3 etc/emscripten/generate_gap_fs_json.py

rm -f gap.worker.js

# Final link of gap.wasm and gap.js
emmake make -j"$JOBS" \
    LDFLAGS="-lidbfs.js -s ASYNCIFY=1 -sTOTAL_STACK=32mb -sASYNCIFY_STACK_SIZE=32000000 -sINITIAL_MEMORY=256mb -sALLOW_MEMORY_GROWTH=1 -sMAXIMUM_MEMORY=2048mb $IO_OBJ $SEMIGROUPS_OBJ -O2" \
    EXEEXT=".html"

echo "=== BUILD COMPLETE! ==="
