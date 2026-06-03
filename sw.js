// Service Worker para notificaciones push SSP Rx Portátil

self.addEventListener('install', event => {
    console.log('SW instalado');
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    console.log('SW activado');
    event.waitUntil(self.clients.claim());
});

self.addEventListener('push', event => {
    const data = event.data.json();

    const options = {
        body: data.body || 'Nueva solicitud de radiografía portátil',
        icon: data.icon || 'https://coorditm.github.io/ssp-portatil/icon-192x192.png',
        badge: data.badge || 'https://coorditm.github.io/ssp-portatil/badge-72x72.png',
        tag: 'nueva-solicitud',
        requireInteraction: true,
        vibrate: [500, 200, 500, 200, 1000],
        data: data.data || {},
        actions: [
            { action: 'abrir', title: '🔍 Ver solicitud' },
            { action: 'cerrar', title: '❌ Cerrar' }
        ]
    };

    event.waitUntil(
        self.registration.showNotification('🚨 Nueva Solicitud Rx Portátil', options)
    );
});

self.addEventListener('notificationclick', event => {
    event.notification.close();

    if (event.action === 'abrir' || event.action === '') {
        const url = event.notification.data?.url || 'https://coorditm.github.io/ssp-portatil/dashboard.html';

        event.waitUntil(
            clients.matchAll({ type: 'window' }).then(clientList => {
                // Si hay una ventana abierta, enfocarla
                for (const client of clientList) {
                    if (client.url.includes('dashboard.html') && 'focus' in client) {
                        return client.focus();
                    }
                }
                // Si no, abrir nueva
                if (clients.openWindow) {
                    return clients.openWindow(url);
                }
            })
        );
    }
});
