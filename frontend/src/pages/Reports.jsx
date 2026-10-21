import { useState, useEffect } from 'react';
import { getReport, exportReport } from '../services/services';
import { HiOutlineDownload } from 'react-icons/hi';

export default function Reports() {
  const [reportType, setReportType] = useState('attendance');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadReport = async () => {
    setLoading(true);
    try {
      const params = {};
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      const res = await getReport(reportType, params);
      setData(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [reportType, startDate, endDate]);

  const handleExport = async (format) => {
    try {
      const params = { type: reportType };
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      const res = await exportReport(format, params);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      const ext = format === 'excel' ? 'xlsx' : 'pdf';
      link.setAttribute('download', `${reportType}_report.${ext}`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  const renderTable = () => {
    if (data.length === 0) {
      return (
        <tbody>
          <tr><td colSpan="8" className="empty-state">No data found for the selected filters.</td></tr>
        </tbody>
      );
    }

    if (reportType === 'attendance') {
      return (
        <>
          <thead>
            <tr>
              <th>Name</th><th>Type</th><th>Present</th><th>Absent</th><th>Late</th><th>Total Hours</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => (
              <tr key={idx}>
                <td>{row.name}</td>
                <td style={{textTransform: 'capitalize'}}>{row.person_type}</td>
                <td><span className="badge badge-active">{row.present}</span></td>
                <td><span className="badge badge-danger">{row.absent}</span></td>
                <td><span className="badge badge-pending">{row.late}</span></td>
                <td>{row.total_hours}h</td>
              </tr>
            ))}
          </tbody>
        </>
      );
    }

    if (reportType === 'employee') {
      return (
        <>
          <thead>
            <tr>
              <th>Employee ID</th><th>Name</th><th>Department</th><th>Designation</th><th>Phone</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => (
              <tr key={idx}>
                <td>{row.employee_id}</td>
                <td>{row.name}</td>
                <td>{row.department}</td>
                <td>{row.designation}</td>
                <td>{row.phone}</td>
                <td><span className={`badge badge-${row.status === 'Active' ? 'active' : 'inactive'}`}>{row.status}</span></td>
              </tr>
            ))}
          </tbody>
        </>
      );
    }

    if (reportType === 'intern') {
      return (
        <>
          <thead>
            <tr>
              <th>Intern ID</th><th>Name</th><th>College</th><th>Department</th><th>Mentor</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => (
              <tr key={idx}>
                <td>{row.intern_id}</td>
                <td>{row.name}</td>
                <td>{row.college}</td>
                <td>{row.department}</td>
                <td>{row.mentor}</td>
              </tr>
            ))}
          </tbody>
        </>
      );
    }

    if (reportType === 'task') {
      return (
        <>
          <thead>
            <tr>
              <th>Title</th><th>Priority</th><th>Deadline</th><th>Status</th><th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => (
              <tr key={idx}>
                <td>{row.title}</td>
                <td><span className={`badge badge-${row.priority?.toLowerCase()}`}>{row.priority}</span></td>
                <td>{row.deadline || '-'}</td>
                <td><span className={`badge badge-${row.status === 'Completed' ? 'completed' : row.status === 'In Progress' ? 'progress' : 'pending'}`}>{row.status}</span></td>
                <td>{row.remarks || '-'}</td>
              </tr>
            ))}
          </tbody>
        </>
      );
    }

    if (reportType === 'finance') {
      return (
        <>
          <thead>
            <tr>
              <th>Date</th><th>Type</th><th>Category</th><th>Description</th><th>Amount</th><th>Payment</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => (
              <tr key={idx}>
                <td>{row.date}</td>
                <td><span className={`badge badge-${row.type === 'Income' ? 'active' : 'danger'}`}>{row.type}</span></td>
                <td>{row.category}</td>
                <td>{row.description || '-'}</td>
                <td style={{ fontWeight: 700, color: row.type === 'Income' ? '#10b981' : '#ef4444' }}>
                  {row.type === 'Income' ? '+' : '-'}₹{parseFloat(row.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </td>
                <td>{row.payment_method || '-'}</td>
                <td><span className={`badge badge-${row.status === 'Paid' ? 'active' : row.status === 'Pending' ? 'pending' : 'inactive'}`}>{row.status}</span></td>
              </tr>
            ))}
          </tbody>
        </>
      );
    }

    return null;
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h2>Reports</h2>
          <p>Generate and export office reports</p>
        </div>
        <div className="page-header-right export-buttons">
          <button className="btn btn-secondary" onClick={() => handleExport('excel')}>
            <HiOutlineDownload size={16} /> Export Excel
          </button>
          <button className="btn btn-danger" onClick={() => handleExport('pdf')}>
            <HiOutlineDownload size={16} /> Export PDF
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <select value={reportType} onChange={(e) => setReportType(e.target.value)}>
          <option value="attendance">Attendance Report</option>
          <option value="employee">Employee Report</option>
          <option value="intern">Intern Report</option>
          <option value="task">Task Report</option>
          <option value="finance">Finance Report</option>
        </select>
        <input type="date" className="date-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} placeholder="Start Date" />
        <input type="date" className="date-input" value={endDate} onChange={(e) => setEndDate(e.target.value)} placeholder="End Date" />
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            {renderTable()}
          </table>
        </div>
      </div>
    </div>
  );
}
