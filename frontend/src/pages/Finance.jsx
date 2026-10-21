import { useState, useEffect } from 'react';
import {
  getFinance, createFinance, updateFinance, deleteFinance,
  getFinanceSummary,
} from '../services/services';
import { HiOutlinePlus, HiOutlinePencil, HiOutlineTrash, HiOutlineTrendingUp, HiOutlineTrendingDown, HiOutlineCurrencyDollar } from 'react-icons/hi';

const defaultForm = {
  type: 'Expense', category: '', amount: '',
  description: '', date: new Date().toISOString().split('T')[0],
  payment_method: 'Cash', status: 'Paid', notes: '',
};

const incomeCategories = ['Client Payment', 'Fund', 'Investment', 'Refund', 'Sale', 'Commission', 'Other'];
const expenseCategories = ['Salary', 'Office Supplies', 'Utilities', 'Travel', 'Food', 'Equipment', 'Rent', 'Services', 'Marketing', 'Other'];
const paymentMethods = ['Cash', 'Bank Transfer', 'Card', 'UPI', 'Cheque', 'Other'];
const statuses = ['Paid', 'Unpaid', 'Pending'];

export default function Finance() {
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState({ total_income: 0, total_expense: 0, balance: 0, total_transactions: 0 });
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [typeFilter, setTypeFilter] = useState('All');

  useEffect(() => {
    loadTransactions();
    loadSummary();
  }, [search]);

  const loadTransactions = async () => {
    try {
      const res = await getFinance(search || undefined);
      setTransactions(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadSummary = async () => {
    try {
      const res = await getFinanceSummary();
      setSummary(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const openAdd = () => {
    setForm({ ...defaultForm, date: new Date().toISOString().split('T')[0] });
    setEditing(null);
    setShowModal(true);
  };

  const openEdit = (trans) => {
    setForm({ ...defaultForm, ...trans });
    setEditing(trans._id);
    setShowModal(true);
  };

  const handleSave = async () => {
    try {
      const data = { ...form, amount: parseFloat(form.amount) || 0 };
      if (editing) {
        await updateFinance(editing, data);
      } else {
        await createFinance(data);
      }
      setShowModal(false);
      loadTransactions();
      loadSummary();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this transaction?')) {
      try {
        await deleteFinance(id);
        loadTransactions();
        loadSummary();
      } catch (err) {
        console.error(err);
      }
    }
  };

  const filtered = transactions.filter(t => typeFilter === 'All' || t.type === typeFilter);

  const statusBadge = (status) => {
    const cls = status === 'Paid' ? 'active' : status === 'Pending' ? 'pending' : 'inactive';
    return <span className={`badge badge-${cls}`}>{status}</span>;
  };

  const formatCurrency = (amount) => {
    const num = parseFloat(amount) || 0;
    return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h2>Finance</h2>
          <p>{transactions.length} transaction(s)</p>
        </div>
        <div className="page-header-right">
          <button className="btn btn-primary" onClick={openAdd}>
            <HiOutlinePlus size={16} /> Add Transaction
          </button>
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card success">
          <HiOutlineTrendingUp size={22} />
          <div className="stat-number" style={{ color: '#10b981' }}>{formatCurrency(summary.total_income)}</div>
          <div className="stat-label">Total Income</div>
        </div>
        <div className="stat-card danger">
          <HiOutlineTrendingDown size={22} />
          <div className="stat-number" style={{ color: '#ef4444' }}>{formatCurrency(summary.total_expense)}</div>
          <div className="stat-label">Total Expense</div>
        </div>
        <div className="stat-card" style={{ borderLeftColor: summary.balance >= 0 ? '#10b981' : '#ef4444' }}>
          <HiOutlineCurrencyDollar size={22} />
          <div className="stat-number" style={{ color: summary.balance >= 0 ? '#10b981' : '#ef4444' }}>{formatCurrency(summary.balance)}</div>
          <div className="stat-label">Balance</div>
        </div>
        <div className="stat-card info">
          <HiOutlineCurrencyDollar size={22} />
          <div className="stat-number">{summary.total_transactions}</div>
          <div className="stat-label">Transactions</div>
        </div>
      </div>

      <div className="filter-bar">
        <div className="search-bar" style={{ width: 260 }}>
          <input
            type="text"
            placeholder="Search transactions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          style={{
            padding: '6px 10px', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-color)', background: 'var(--bg-input)',
            color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, marginLeft: 8,
          }}
        >
          <option value="All">All Types</option>
          <option value="Income">Income</option>
          <option value="Expense">Expense</option>
        </select>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Category</th>
                <th>Description</th>
                <th>Amount</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan="8" className="empty-state">No transactions found.</td>
                </tr>
              ) : (
                filtered.map((t) => (
                  <tr key={t._id}>
                    <td>{t.date}</td>
                    <td>
                      <span className={`badge badge-${t.type === 'Income' ? 'active' : 'danger'}`}>
                        {t.type}
                      </span>
                    </td>
                    <td>{t.category}</td>
                    <td>{t.description || '-'}</td>
                    <td style={{ fontWeight: 700, color: t.type === 'Income' ? '#10b981' : '#ef4444' }}>
                      {t.type === 'Income' ? '+' : '-'}{formatCurrency(t.amount)}
                    </td>
                    <td>{t.payment_method || '-'}</td>
                    <td>{statusBadge(t.status)}</td>
                    <td>
                      <div className="table-actions">
                        <button className="btn btn-secondary btn-icon btn-sm" onClick={() => openEdit(t)}>
                          <HiOutlinePencil size={14} />
                        </button>
                        <button className="btn btn-danger btn-icon btn-sm" onClick={() => handleDelete(t._id)}>
                          <HiOutlineTrash size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editing ? 'Edit Transaction' : 'Add Transaction'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label>Date *</label>
                  <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Type *</label>
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value, category: '' })}>
                    <option value="Income">Income</option>
                    <option value="Expense">Expense</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Category *</label>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                    <option value="">Select Category</option>
                    {(form.type === 'Income' ? incomeCategories : expenseCategories).map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Amount *</label>
                  <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
                </div>
                <div className="form-group">
                  <label>Payment Method</label>
                  <select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
                    {paymentMethods.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Brief description" />
                </div>
                <div className="form-group full-width">
                  <label>Notes</label>
                  <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave}>
                {editing ? 'Update' : 'Add'} Transaction
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
