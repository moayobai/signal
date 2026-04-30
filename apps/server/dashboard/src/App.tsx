import { Routes, Route, NavLink } from 'react-router-dom';
import Home from './pages/Home';
import Contacts from './pages/Contacts';
import ContactDetail from './pages/ContactDetail';
import CallDetail from './pages/CallDetail';
import Search from './pages/Search';
import { HomeIcon, ContactsIcon, SearchIcon } from './components/icons';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LogoMark } from './components/Logo';

export default function App() {
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <LogoMark size={18} />
          <span>Signal</span>
          <span className="small">v0.4</span>
        </div>

        <nav className="nav">
          <NavLink to="/" end>
            <span className="icon">
              <HomeIcon />
            </span>
            <span>Home</span>
          </NavLink>
          <NavLink to="/contacts">
            <span className="icon">
              <ContactsIcon />
            </span>
            <span>Contacts</span>
          </NavLink>
          <NavLink to="/search">
            <span className="icon">
              <SearchIcon />
            </span>
            <span>Search</span>
          </NavLink>
        </nav>

        <div className="sidebar-foot">
          <div className="row">
            <span>Server</span>
            <span className="row-flex">
              <span className="pulse" /> Online
            </span>
          </div>
          <div className="row">
            <span>Build</span>
            <span>{new Date().toISOString().slice(0, 10)}</span>
          </div>
        </div>
      </aside>

      <main className="content">
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/contacts" element={<Contacts />} />
            <Route path="/contacts/:id" element={<ContactDetail />} />
            <Route path="/calls/:id" element={<CallDetail />} />
            <Route path="/search" element={<Search />} />
          </Routes>
        </ErrorBoundary>
      </main>
    </div>
  );
}
