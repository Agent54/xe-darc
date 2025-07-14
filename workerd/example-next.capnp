using Workerd = import "/workerd/workerd.capnp";
# TODO: add logging and APM
# TODO: convert to typescript

const config :Workerd.Config = (
  services = [
    # The site worker contains JavaScript logic to serve static files from a directory. The logic
    # includes things like setting the right content-type (based on file name), defaulting to
    # `index.html`, and so on.

    # ( name = "proxy-worker", worker = .proxyWorker ),

    (
      name = "file-worker", 
      worker =  (
        modules = [
          ( name = "files.js", esModule = embed "files.js" ),
        ],
        bindings = [
          ( name = "files", service = "files" ),
          ( name = "data", service = "data" ),
          ( name = "download", service = "download" )
        ],

        compatibilityDate = "2024-04-03",
      )
    ),
    
    ( name = "debug-worker", worker = .debugWorker ),

    (
      name = "auth-worker", worker = (
        modules = [
          ( name = "auth.js", esModule = embed "auth.js" ),
        ],
        bindings = [
          ( name = "index", text = embed "./index.html" ),

          ( name = "router", service = "router-worker"),
          
          ( name= "config", fromEnvironment = "SERVER_CONFIG"),
          ( name= "env", fromEnvironment = "ENV"),
        ],

        compatibilityFlags = ["nodejs_compat"],
        compatibilityDate = "2024-12-05",
      )
    ),

    (
      name = "app-worker", worker = (
        cacheApiOutbound = "cache:0",

        globalOutbound = "router-worker",

        modules = [
          ( name = "_worker.js", esModule = embed "build/_worker.js" ),
        ],

        bindings = [
          ( name = "ASSETS", service = "file-worker" ),
          ( name= "CH_USER", fromEnvironment = "CH_USER"),
          ( name= "CH_PASS", fromEnvironment = "CH_PASS"),
          ( name= "CH_ORIGIN", fromEnvironment = "CH_ORIGIN"),
          ( name= "ENV", fromEnvironment = "ENV")
          # ( name= "clickhouse", service = "clickhouse" )
        ],

        compatibilityDate = "2024-12-05",
      )
    ),
    
    (
      name = "router-worker",
      worker = (
        # "brotli_content_encoding", "rpc"
        modules = [
          ( name = "router.js", esModule = embed "router.js" )
        ],
        bindings = [
          ( name = "app", service = "app-worker" ),
          ( name = "ASSETS", service = "file-worker" ),
          ( name = "routes", json = embed "build/_routes.json" ),
          ( name = "headers", text = embed "build/_headers" ),
          ( name= "ENV", fromEnvironment = "ENV")
        ],

        compatibilityFlags = ["nodejs_compat"],
        compatibilityDate = "2024-04-03",
      )
    ),

    (
      name = "cache:0", 
      worker = (
        modules = [
          ( name = "cache-entry.worker.js", esModule = embed "../node_modules/miniflare/dist/src/workers/cache/cache-entry.worker.js" ),
        ],
        bindings = [
          ( name = "MINIFLARE_OBJECT", durableObjectNamespace = ( serviceName = "cache:cache", className = "CacheObject" ) )
        ],

        compatibilityDate = "2023-07-24",
        compatibilityFlags = ["nodejs_compat", "experimental"],
      )
    ),

    ( 
      name = "cache:cache", 
      worker = (
        modules = [
          ( name = "cache.worker.js", esModule = embed "../node_modules/miniflare/dist/src/workers/cache/cache.worker.js" ),
        ],
        bindings = [
          ( name = "MINIFLARE_BLOBS", service = "cache:storage" ),
          ( name = "MINIFLARE_LOOPBACK", service = "debug-worker" )
        ],

        durableObjectStorage = (localDisk = "cache:storage"),

        durableObjectNamespaces = [
          ( uniqueKey = "miniflare-CacheObject", className = "CacheObject" )
        ],

        compatibilityDate = "2023-07-24",
        compatibilityFlags = ["nodejs_compat", "experimental"],
      )
    ),

    ( 
      name = "internet",
      network = (
        allow = [
          "private",
          "public",
           # "local" # fixme: use service binding or network router service and replace the hook js in sveltekit for asset serveice
        ],
        tlsOptions = (trustBrowserCas = true)
      )
    ),

    ( name = "files", disk = "content-dir" ),
    ( name = "data", disk = "content-dir" ),
    ( name = "download", disk = "content-dir" ),
    ( name = "cache:storage", disk = (path = "./cache", writable = true )),
  ],

  extensions = [
     (
        modules = [
          ( name = "miniflare:shared", esModule = embed "../node_modules/miniflare/dist/src/workers/shared/index.worker.js" ),
          ( name = "miniflare:zod", esModule = embed "../node_modules/miniflare/dist/src/workers/shared/zod.worker.js" )
        ]
     )
  ],

  #   address = "unix:./worker.socket"
  sockets = [
    ( name = "site", address = "*:3006", http = (), service = "auth-worker" ),
  ],
);

const debugWorker :Workerd.Worker = (
  modules = [
    ( name = "debug.js", esModule = embed "debug.js" ),
  ],

   compatibilityDate = "2024-04-03",
);
