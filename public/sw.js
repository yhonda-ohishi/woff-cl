const CACHE_NAME = 'woff-v2';
const urlsToCache = [
  '/manifest.json',
  '/icon.svg'
];

// インストール時にキャッシュを作成し、即座にアクティブ化
self.addEventListener('install', (event) => {
  // 古いService Workerを待たずに即座にアクティブ化
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

// ネットワーク優先戦略（HTMLとJSは常に最新を取得）
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // HTMLとJavaScript/CSSは常にネットワークから取得
  if (url.pathname.endsWith('.html') ||
      url.pathname.endsWith('.js') ||
      url.pathname.endsWith('.css') ||
      url.pathname === '/') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // 成功したレスポンスはキャッシュに保存
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // ネットワークエラー時のみキャッシュから返す
          return caches.match(event.request);
        })
    );
  } else {
    // 画像などの静的アセットはキャッシュ優先
    event.respondWith(
      caches.match(event.request)
        .then((response) => {
          return response || fetch(event.request);
        })
    );
  }
});

// 古いキャッシュを削除し、即座に制御を開始
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all([
        // 古いキャッシュを削除
        ...cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        }),
        // 即座にクライアントを制御
        self.clients.claim()
      ]);
    })
  );
});
