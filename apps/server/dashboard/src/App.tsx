import { Routes, Route, NavLink } from 'react-router-dom';
import Home from './pages/Home';
import Contacts from './pages/Contacts';
import ContactDetail from './pages/ContactDetail';
import CallDetail from './pages/CallDetail';

export default function App() {
  return (
    <div className="app">
      <nav className="sidebar">
        <h1>SIGNAL</h1>
        <NavLink to="/" end>Home</NavLink>
        <NavLink to="/contacts">Contacts</NavLink>
      </nav>
      <main className="content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/contacts/:id" element={<ContactDetail />} />
          <Route path="/calls/:id" element={<CallDetail />} />
        </Routes>
      </main>
    </div>
  );
}
