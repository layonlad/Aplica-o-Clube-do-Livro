/* Push only: never cache pages, authenticated responses or user files. */
self.addEventListener('push', event => {
  let id=''
  try{const value=event.data?.json();if(/^[0-9a-f-]{36}$/i.test(value?.notificationId??''))id=value.notificationId}catch{}
  event.waitUntil((async()=>{
    await self.registration.showNotification('Clube do Livro',{
      body:'Você tem uma nova atividade. Abra o aplicativo para ver.',
      icon:'/icon.svg',badge:'/icon.svg',tag:id?'activity:'+id:'activity',
      data:{notificationId:id},renotify:false
    })
    for(const client of await self.clients.matchAll({type:'window',includeUncontrolled:true}))client.postMessage({type:'notifications-changed'})
  })())
})
self.addEventListener('notificationclick',event=>{
  event.notification.close()
  const id=event.notification.data?.notificationId
  const url=new URL('/#/app/notifications'+(/^[0-9a-f-]{36}$/i.test(id??'')?'?open='+id:''),self.location.origin).href
  event.waitUntil((async()=>{
    for(const client of await self.clients.matchAll({type:'window',includeUncontrolled:true})){
      if(new URL(client.url).origin===self.location.origin){await client.navigate(url);return client.focus()}
    }
    return self.clients.openWindow(url)
  })())
})
