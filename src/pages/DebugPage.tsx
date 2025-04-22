import React, { useEffect, useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { useRoomStore } from '../stores/roomStore';
import { useNavigate } from 'react-router-dom';

const DebugPage: React.FC = () => {
    const { socket, isConnected } = useSocket();
    const { currentVideoId, isPlaying, currentTime } = useRoomStore();
    const navigate = useNavigate();
    const [logs, setLogs] = useState<string[]>([]);
    const [socketEvents, setSocketEvents] = useState<any[]>([]);
    const [connectionStatus, setConnectionStatus] = useState({
        socket: false,
        server: '',
        connectionTime: '',
        reconnects: 0
    });

    // Debug için olay dinleyicileri ekle
    useEffect(() => {
        if (!socket) return;

        const addLog = (message: string) => {
            setLogs(prev => {
                const newLogs = [...prev, `${new Date().toISOString()} - ${message}`];
                // Maksimum 100 log tut
                if (newLogs.length > 100) {
                    return newLogs.slice(-100);
                }
                return newLogs;
            });
        };

        const handleSocketEvent = (eventName: string, data: any) => {
            setSocketEvents(prev => {
                const newEvents = [
                    { time: new Date().toISOString(), event: eventName, data: JSON.stringify(data) },
                    ...prev
                ];
                // Maksimum 50 olay tut
                if (newEvents.length > 50) {
                    return newEvents.slice(0, 50);
                }
                return newEvents;
            });
        };

        // Bağlantı bilgilerini güncelle
        if (isConnected && socket) {
            setConnectionStatus({
                socket: true,
                server: socket.io?.opts?.host || 'https://youtube-watchparty.onrender.com',
                connectionTime: new Date().toISOString(),
                reconnects: 0
            });
            addLog(`Socket.io bağlantısı kuruldu: ${socket.id}`);
        }

        // Olay dinleyicileri
        const onConnect = () => {
            setConnectionStatus(prev => ({
                ...prev,
                socket: true,
                connectionTime: new Date().toISOString()
            }));
            addLog(`Socket.io yeniden bağlandı: ${socket.id}`);
        };

        const onDisconnect = (reason: string) => {
            setConnectionStatus(prev => ({
                ...prev,
                socket: false
            }));
            addLog(`Socket.io bağlantısı kesildi. Neden: ${reason}`);
        };

        const onReconnect = (attempt: number) => {
            setConnectionStatus(prev => ({
                ...prev,
                reconnects: prev.reconnects + 1
            }));
            addLog(`Socket.io ${attempt}. denemede yeniden bağlandı`);
        };

        const onError = (error: any) => {
            addLog(`Socket.io hatası: ${error.message || 'Bilinmeyen hata'}`);
        };

        // Video olaylarını dinle
        const onVideoLoad = (data: any) => {
            handleSocketEvent('video:load', data);
            addLog(`Video yükleme olayı: ${data.videoId}`);
        };

        const onVideoPlay = (data: any) => {
            handleSocketEvent('video:play', data);
            addLog('Video oynatma olayı');
        };

        const onVideoPause = (data: any) => {
            handleSocketEvent('video:pause', data);
            addLog('Video duraklatma olayı');
        };

        const onVideoSeek = (data: any) => {
            handleSocketEvent('video:seek', data);
            addLog(`Video ileri/geri sarma olayı: ${data.time}`);
        };

        const onVideoSync = (data: any) => {
            handleSocketEvent('video:sync', data);
            addLog(`Video senkronizasyon olayı: ${data.time}, ${data.isPlaying ? 'Oynatılıyor' : 'Duraklatıldı'}`);
        };

        // Dinleyicileri ekle
        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.io?.on('reconnect', onReconnect);
        socket.on('error', onError);
        socket.on('video:load', onVideoLoad);
        socket.on('video:play', onVideoPlay);
        socket.on('video:pause', onVideoPause);
        socket.on('video:seek', onVideoSeek);
        socket.on('video:sync', onVideoSync);

        // Temizleme
        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.io?.off('reconnect', onReconnect);
            socket.off('error', onError);
            socket.off('video:load', onVideoLoad);
            socket.off('video:play', onVideoPlay);
            socket.off('video:pause', onVideoPause);
            socket.off('video:seek', onVideoSeek);
            socket.off('video:sync', onVideoSync);
        };
    }, [socket, isConnected]);

    // Manuel bir test isteği gönder
    const sendTestMessage = () => {
        if (socket && isConnected) {
            try {
                socket.emit('debug:ping', { timestamp: Date.now() });
                setLogs(prev => [...prev, `${new Date().toISOString()} - Test ping mesajı gönderildi`]);
            } catch (error) {
                console.error('Test mesajı gönderme hatası:', error);
                setLogs(prev => [...prev, `${new Date().toISOString()} - Test mesajı gönderme hatası: ${(error as Error).message}`]);
            }
        } else {
            setLogs(prev => [...prev, `${new Date().toISOString()} - Socket bağlı değil, test mesajı gönderilemedi`]);
        }
    };

    // Backend sunucusunun durumunu kontrol et
    const checkBackendStatus = async () => {
        try {
            const response = await fetch('https://youtube-watchparty.onrender.com/');
            const text = await response.text();
            setLogs(prev => [...prev, `${new Date().toISOString()} - Backend durumu: ${response.status}, ${text}`]);
        } catch (error) {
            console.error('Backend durum kontrolü hatası:', error);
            setLogs(prev => [...prev, `${new Date().toISOString()} - Backend durum kontrolü hatası: ${(error as Error).message}`]);
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 text-white p-4">
            <div className="max-w-6xl mx-auto">
                <header className="mb-6">
                    <div className="flex justify-between items-center">
                        <h1 className="text-2xl font-bold">YouTube Watch Party - Debug Panel</h1>
                        <button
                            onClick={() => navigate('/')}
                            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded"
                        >
                            Ana Sayfaya Dön
                        </button>
                    </div>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Bağlantı Durumu */}
                    <div className="card">
                        <h2 className="text-xl font-bold mb-4">Bağlantı Durumu</h2>
                        <div className="space-y-2">
                            <div className="flex items-center">
                                <div className={`w-3 h-3 rounded-full mr-2 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                <span>Socket.io Bağlantısı: {isConnected ? 'Bağlı' : 'Bağlı Değil'}</span>
                            </div>
                            <div>Sunucu URL: {connectionStatus.server}</div>
                            <div>Son Bağlantı: {connectionStatus.connectionTime}</div>
                            <div>Yeniden Bağlanma Sayısı: {connectionStatus.reconnects}</div>
                        </div>
                        <div className="mt-4 flex space-x-3">
                            <button
                                onClick={sendTestMessage}
                                className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-sm"
                            >
                                Test Mesajı Gönder
                            </button>
                            <button
                                onClick={checkBackendStatus}
                                className="px-3 py-1 bg-green-600 hover:bg-green-500 rounded text-sm"
                            >
                                Backend Durumu Kontrol Et
                            </button>
                        </div>
                    </div>

                    {/* Video Durumu */}
                    <div className="card">
                        <h2 className="text-xl font-bold mb-4">Video Durumu</h2>
                        <div className="space-y-2">
                            <div>Video ID: {currentVideoId || 'Yok'}</div>
                            <div>Oynatma Durumu: {isPlaying ? 'Oynatılıyor' : 'Duraklatıldı'}</div>
                            <div>Geçerli Zaman: {Math.round(currentTime)} saniye</div>
                        </div>
                        <div className="mt-4">
                            <button
                                onClick={() => navigate(`/room/${Math.random().toString(36).substring(2, 8)}`)}
                                className="px-3 py-1 bg-purple-600 hover:bg-purple-500 rounded text-sm"
                            >
                                Yeni Test Odası Oluştur
                            </button>
                        </div>
                    </div>

                    {/* Loglar */}
                    <div className="card col-span-1 lg:col-span-2">
                        <h2 className="text-xl font-bold mb-4">Debug Logları</h2>
                        <div className="bg-gray-800 rounded p-3 h-60 overflow-y-auto text-sm font-mono">
                            {logs.length === 0 ? (
                                <div className="text-gray-500">Henüz log kaydı yok</div>
                            ) : (
                                logs.map((log, index) => (
                                    <div key={index} className="mb-1">{log}</div>
                                ))
                            )}
                        </div>
                        <div className="mt-2 flex justify-end">
                            <button
                                onClick={() => setLogs([])}
                                className="px-3 py-1 bg-red-600 hover:bg-red-500 rounded text-sm"
                            >
                                Logları Temizle
                            </button>
                        </div>
                    </div>

                    {/* Socket Olayları */}
                    <div className="card col-span-1 lg:col-span-2">
                        <h2 className="text-xl font-bold mb-4">Socket.io Olayları</h2>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-gray-800">
                                        <th className="p-2 text-left">Zaman</th>
                                        <th className="p-2 text-left">Olay</th>
                                        <th className="p-2 text-left">Veri</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {socketEvents.length === 0 ? (
                                        <tr>
                                            <td colSpan={3} className="p-2 text-gray-500">Henüz olay kaydedilmedi</td>
                                        </tr>
                                    ) : (
                                        socketEvents.map((event, index) => (
                                            <tr key={index} className={index % 2 === 0 ? 'bg-gray-800 bg-opacity-50' : ''}>
                                                <td className="p-2">{event.time.split('T')[1].split('.')[0]}</td>
                                                <td className="p-2">{event.event}</td>
                                                <td className="p-2 font-mono text-xs truncate max-w-xs">{event.data}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="mt-2 flex justify-end">
                            <button
                                onClick={() => setSocketEvents([])}
                                className="px-3 py-1 bg-red-600 hover:bg-red-500 rounded text-sm"
                            >
                                Olayları Temizle
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DebugPage; 