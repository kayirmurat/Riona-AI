self.addEventListener("push", (event) => {
  let data = { title: "Riona AI", body: "Yeni bir bildirim var." };
  try {
    data = event.data ? event.data.json() : data;
  } catch (e) {
    // JSON değilse varsayılan metni kullan.
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "Riona AI", {
      body: data.body || "",
      icon: "/icon.png",
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
