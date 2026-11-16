# Real-world sample sources

These files are vendored, unmodified, from open-source projects. They are
imported with Vite's `?raw` suffix and are never compiled as part of the
playground bundle. They are long on purpose: the playground should exercise
real declarations, properties, generics, strings and comments instead of a
hand-written toy snippet.

| File | Project | Source | License |
| --- | --- | --- | --- |
| `json-serializer-options.cs` | .NET runtime | <https://github.com/dotnet/runtime/blob/main/src/libraries/System.Text.Json/src/System/Text/Json/Serialization/JsonSerializerOptions.cs> | MIT |
| `typescript-vscode-arrays.ts` | VS Code | <https://github.com/microsoft/vscode/blob/main/src/vs/base/common/arrays.ts> | MIT |
| `javascript-express-application.js` | Express | <https://github.com/expressjs/express/blob/master/lib/application.js> | MIT |
| `python-requests-sessions.py` | Requests | <https://github.com/psf/requests/blob/main/src/requests/sessions.py> | Apache-2.0 |
| `go-gin-context.go` | Gin | <https://github.com/gin-gonic/gin/blob/master/context.go> | MIT |
| `rust-axum-routing.rs` | Axum | <https://github.com/tokio-rs/axum/blob/main/axum/src/routing/mod.rs> | MIT |
| `java-guava-immutablelist.java` | Guava | <https://github.com/google/guava/blob/master/guava/src/com/google/common/collect/ImmutableList.java> | Apache-2.0 |
| `kotlin-okhttp-client.kt` | OkHttp | <https://github.com/square/okhttp/blob/master/okhttp/src/commonJvmAndroid/kotlin/okhttp3/OkHttpClient.kt> | Apache-2.0 |
| `swift-vapor-application.swift` | Vapor | <https://github.com/vapor/vapor/blob/main/Sources/Vapor/Application.swift> | MIT |
| `cpp-fmt-ranges.h` | {fmt} | <https://github.com/fmtlib/fmt/blob/master/include/fmt/ranges.h> | MIT |

## Copyright notices

- .NET runtime: Copyright (c) .NET Foundation and Contributors
- VS Code: Copyright (c) Microsoft Corporation
- Express: Copyright (c) 2009-2013 TJ Holowaychuk, 2013 Roman Shtylman, 2014-2015 Douglas Christopher Wilson
- Requests: Copyright Kenneth Reitz and contributors
- Gin: Copyright 2014 Manu Martinez-Almeida
- Axum: Copyright (c) 2019-2025 axum Contributors
- Guava: Copyright (C) 2007 The Guava Authors
- OkHttp: Copyright (C) 2012 Square, Inc.
- Vapor: Copyright (c) 2020 Qutheory, LLC
- {fmt}: Copyright (c) 2012 - present, Victor Zverovich and {fmt} contributors

The MIT files are covered by [`LICENSES/MIT.txt`](./LICENSES/MIT.txt); the
Apache-2.0 files are covered by [`LICENSES/Apache-2.0.txt`](./LICENSES/Apache-2.0.txt).
Where present, the original license headers are retained in the vendored file.
