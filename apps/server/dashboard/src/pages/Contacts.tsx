import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

export default function Contacts() {
  const q = useQuery({ queryKey: ['contacts'], queryFn: api.contacts });
  return (
    <div>
      <h2>Contacts</h2>
      <table className="data-table">
        <thead><tr><th>Name</th><th>Company</th><th>Role</th><th>Email</th></tr></thead>
        <tbody>
          {q.data?.map(c => (
            <tr key={c.id}>
              <td><Link to={`/contacts/${c.id}`}>{c.name}</Link></td>
              <td>{c.company ?? '—'}</td>
              <td>{c.role ?? '—'}</td>
              <td>{c.email ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
