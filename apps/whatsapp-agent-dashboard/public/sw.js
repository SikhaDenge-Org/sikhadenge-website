const CACHE_NAME =
  "sikhadenge-agent-shell-v2";

const OFFLINE_URL =
  "/offline";

const PRECACHE_URLS = [
  OFFLINE_URL,
  "/pwa/icon-192.png",
  "/pwa/icon-512.png",
  "/sikhadenge-app-mark-v3.svg",
];

self.addEventListener(
  "install",
  (event) => {
    event.waitUntil(
      caches
        .open(CACHE_NAME)
        .then((cache) =>
          cache.addAll(
            PRECACHE_URLS,
          ),
        )
        .catch(() => undefined),
    );

    self.skipWaiting();
  },
);

self.addEventListener(
  "activate",
  (event) => {
    event.waitUntil(
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter(
                (key) =>
                  key.startsWith(
                    "sikhadenge-agent-shell-",
                  ) &&
                  key !== CACHE_NAME,
              )
              .map((key) =>
                caches.delete(key),
              ),
          ),
        ),
    );

    self.clients.claim();
  },
);

self.addEventListener(
  "fetch",
  (event) => {
    const request =
      event.request;

    if (
      request.method !==
      "GET"
    ) {
      return;
    }

    const url =
      new URL(
        request.url,
      );

    if (
      url.origin !==
      self.location.origin
    ) {
      return;
    }

    if (
      url.pathname.startsWith(
        "/api/",
      )
    ) {
      return;
    }

    if (
      request.mode ===
      "navigate"
    ) {
      event.respondWith(
        fetch(request).catch(
          async () => {
            const cached =
              await caches.match(
                OFFLINE_URL,
              );

            return (
              cached ||
              Response.error()
            );
          },
        ),
      );

      return;
    }

    const cacheableAsset =
      url.pathname.startsWith(
        "/_next/static/",
      ) ||
      /\.(?:png|jpg|jpeg|webp|svg|ico|woff2?)$/i.test(
        url.pathname,
      );

    if (!cacheableAsset) {
      return;
    }

    event.respondWith(
      caches
        .match(request)
        .then(
          async (
            cached,
          ) => {
            if (cached) {
              return cached;
            }

            const response =
              await fetch(
                request,
              );

            if (
              response.ok
            ) {
              const copy =
                response.clone();

              void caches
                .open(
                  CACHE_NAME,
                )
                .then(
                  (cache) =>
                    cache.put(
                      request,
                      copy,
                    ),
                );
            }

            return response;
          },
        ),
    );
  },
);
