const IMAGE_CACHE_NAME='beer-shelf-image-responses-v1';
const isImageBanImage=request=>{
  if(request.method!=='GET'||request.destination!=='image')return false;
  try{return new URL(request.url).hostname.endsWith('imageban.ru')}catch(_){return false;}
};

self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));

self.addEventListener('fetch',event=>{
  if(!isImageBanImage(event.request))return;
  event.respondWith((async()=>{
    const cache=await caches.open(IMAGE_CACHE_NAME),cached=await cache.match(event.request);
    if(cached)return cached;
    const response=await fetch(event.request);
    if(response&&(response.ok||response.type==='opaque'))event.waitUntil(cache.put(event.request,response.clone()));
    return response;
  })());
});

self.addEventListener('message',event=>{
  const data=event.data;
  if(data?.type!=='beer-image-cache-delete'||typeof data.url!=='string')return;
  event.waitUntil(caches.open(IMAGE_CACHE_NAME).then(cache=>cache.delete(data.url)));
});
