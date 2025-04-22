import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import RoomPage from './pages/RoomPage';
import NotFoundPage from './pages/NotFoundPage';
import { SocketProvider } from './context/SocketContext';
import { UserProvider } from './context/UserContext';
import DebugPage from './pages/DebugPage';

function App() {
  return (
    <UserProvider>
      <SocketProvider>
        <Router>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/room/:roomId" element={<RoomPage />} />
            <Route path="/debug" element={<DebugPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Router>
      </SocketProvider>
    </UserProvider>
  );
}

export default App;