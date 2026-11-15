/* Offline support for the retaining wall calculator only — registered with
 * scope /retaining-walls (see src/app/retaining-walls/offlineSupport.tsx),
 * so it never controls any other part of the site.
 *
 * What it does:
 *  - page loads under /retaining-walls: network first (so an online visit
 *    always gets the current build), falling back to the copy saved from
 *    the last visit. A project lives at /retaining-walls/project?id=…, one
 *    static page for every project, so its saved copy is keyed without
 *    the query string and works for any project id — including one made
 *    while offline.
 *  - /_next/static/*: cache first. Those files are content-hashed, so a
 *    cached copy is never stale.
 *  - "warm" message: fetch the three pages and every script/style/font
 *    they reference, so the calculator works offline even if the device
 *    has only ever opened one of them.
 *
 * The wall data itself isn't handled here — that's Firestore's own
 * on-device cache (firebase/client.ts) and, for the scratch wall,
 * localStorage. */

const STATIC_CACHE = "rw-static-v1"
const PAGE_CACHE = "rw-pages-v1"
const SHELLS = ["/retaining-walls", "/retaining-walls/scratch", "/retaining-walls/project"]

self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()))

const isStatic = (url) => url.pathname.startsWith("/_next/static/")

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE)
  const hit = await cache.match(request, { ignoreVary: true })
  if (hit) return hit
  const response = await fetch(request)
  if (response.ok) cache.put(request, response.clone())
  return response
}

/** network, falling back to whatever was saved under `key` last time */
async function networkFirst(request, cacheName, key) {
  const cache = await caches.open(cacheName)
  try {
    const response = await fetch(request)
    if (response.ok && !response.redirected) cache.put(key, response.clone())
    return response
  } catch (err) {
    const hit = await cache.match(key, { ignoreVary: true })
    if (hit) return hit
    throw err
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (isStatic(url)) {
    event.respondWith(cacheFirst(request))
    return
  }
  if (request.mode === "navigate") {
    if (url.pathname === "/retaining-walls" || url.pathname.startsWith("/retaining-walls/")) {
      event.respondWith(networkFirst(request, PAGE_CACHE, url.pathname))
    }
    return
  }
  // the logo, icons and fonts the page furniture uses
  if (request.destination === "image" || request.destination === "font" || request.destination === "manifest") {
    event.respondWith(networkFirst(request, STATIC_CACHE, request.url))
  }
  // everything else (Next's data requests, Firestore, auth) goes straight
  // to the network; offline, Next falls back to a full page load, which
  // the rule above then answers from the saved copy
})

/** every /_next/static file a page's HTML mentions — script and style
 * tags carry the full path, the inlined route data only "static/…" */
function staticUrlsIn(html) {
  const urls = new Set()
  const pattern = /(?:\/_next\/)?static\/(?:chunks|css|media)\/[^"'\\\s?)<>]+/g
  for (const match of html.match(pattern) || []) urls.add(match.startsWith("/_next/") ? match : `/_next/${match}`)
  return urls
}

async function warm() {
  const pages = await caches.open(PAGE_CACHE)
  const statics = await caches.open(STATIC_CACHE)
  const wanted = new Set()
  for (const shell of SHELLS) {
    const response = await fetch(shell, { credentials: "same-origin" })
    if (!response.ok || response.redirected) throw new Error(`warm: ${shell} answered ${response.status}`)
    const html = await response.clone().text()
    await pages.put(shell, response)
    for (const url of staticUrlsIn(html)) wanted.add(url)
  }
  await Promise.all(
    [...wanted].map(async (url) => {
      if (await statics.match(url, { ignoreVary: true })) return
      const response = await fetch(url)
      if (response.ok) await statics.put(url, response)
    }),
  )
  // every page fetched cleanly, so `wanted` is the whole current build:
  // drop hashed files left behind by older builds
  for (const request of await statics.keys()) {
    const url = new URL(request.url)
    if (isStatic(url) && !wanted.has(url.pathname)) await statics.delete(request)
  }
}

self.addEventListener("message", (event) => {
  if (event.data === "warm") event.waitUntil(warm().catch((err) => console.warn("Retaining walls offline warm-up failed", err)))
})
