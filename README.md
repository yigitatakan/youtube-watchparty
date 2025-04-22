# YouTube Watch Party

Bu proje, arkadaşlarınızla YouTube videolarını senkronize bir şekilde izlemenizi sağlayan bir web uygulamasıdır.

## Özellikler

- Kullanıcı dostu arayüz
- Gerçek zamanlı video senkronizasyonu
- Sohbet özelliği
- Oda tabanlı izleme
- Mobil uyumlu tasarım

## Demo

Canlı demo: [https://youtube-watchparty.vercel.app](https://youtube-watchparty.vercel.app)

## Teknoloji Yığını

- **Frontend:** React, TypeScript, Vite, TailwindCSS
- **Backend:** Node.js, Express, Socket.io
- **Deployment:** Vercel (Frontend), Render.com (Backend)

## Kurulum

### Gereksinimler
- Node.js (v16+)
- npm veya yarn

### Yerel Geliştirme

1. Repo'yu klonlayın:
```bash
git clone https://github.com/yigitatakan/youtube-watchparty.git
cd youtube-watchparty
```

2. Frontend bağımlılıklarını yükleyin:
```bash
npm install
```

3. Backend bağımlılıklarını yükleyin:
```bash
cd server
npm install
cd ..
```

4. Frontend ve backend'i ayrı terminallerde çalıştırın:
```bash
# Terminal 1 (Frontend)
npm run dev

# Terminal 2 (Backend)
cd server
npm run dev
```

## Kullanım

1. Ana sayfadan "Oda Oluştur" veya "Odaya Katıl" seçeneğini seçin
2. Oda kodu paylaşarak arkadaşlarınızı davet edin
3. YouTube video URL'si veya ID'si girerek video ekleyin
4. Oynatma, duraklatma ve ileri/geri alma kontrolleri tüm katılımcılar arasında senkronize olacaktır

## Notlar

- Uygulama, aynı tarayıcıda farklı sekmeler arasında senkronizasyon için BroadcastChannel API'sini kullanır
- Farklı cihazlar arasında senkronizasyon için gerçek bir sunucu bağlantısı kullanılır
- Backend sunucusu ücretsiz planda olduğu için belirli süre sonra uyku moduna geçebilir, ilk bağlantı biraz zaman alabilir

## Lisans

MIT 