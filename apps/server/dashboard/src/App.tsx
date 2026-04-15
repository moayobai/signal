import { Routes, Route, NavLink } from 'react-router-dom';
import Home from './pages/Home';
import Contacts from './pages/Contacts';
import ContactDetail from './pages/ContactDetail';
import CallDetail from './pages/CallDetail';
import { HomeIcon, ContactsIcon } from './components/icons';

export default function App() {
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="dot" />
          <span>Signal</span>
          <span className="small">v0.4</span>
        </div>

        <nav className="nav">
          <NavLink to="/" end>
            <span className="icon"><HomeIcon /></span>
            <span>Home</span>
          </NavLink>
          <NavLink to="/contacts">
            <span className="icon"><ContactsIcon /></span>
            <span>Contacts</span>
          </NavLink>
        </nav>

        <div className="sidebar-foot">
          <div className="row">
            <span>Server</span>
            <span className="row-flex"><span className="pulse" /> Online</span>
          </div>
          <div className="row">
            <span>Build</span>
            <span>{new Date().toISOString().slice(0, 10)}</span>
          </div>
        </div>
      </aside>

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
