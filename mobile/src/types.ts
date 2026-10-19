import type { NavigatorScreenParams } from '@react-navigation/native';

export interface Employee {
  _id: string;
  employee_id: string;
  name: string;
  phone?: string;
  email?: string;
  department?: string;
  designation?: string;
  joining_date?: string;
  dob?: string;
  status?: 'Active' | 'Inactive' | 'On Leave';
  notes?: string;
  photo_path?: string;
  college?: string;
  mentor_id?: string;
  mentor_name?: string;
  mentor_email?: string;
  mentor_phone?: string;
  mentor_department?: string;
  mentor_designation?: string;
  person_type: 'employee' | 'intern';
  created_at?: string;
  updated_at?: string;
  token?: string;
  refresh_token?: string;
}

export interface AttendanceRecord {
  _id: string;
  person_type: 'employee' | 'intern';
  person_id: string;
  name?: string;
  employee_id?: string;
  date: string;
  status: string;
  clock_in: string | null;
  clock_out: string | null;
  working_hours: number | null;
  notes?: string;
  photo_path?: string;
  latitude?: number;
  longitude?: number;
  created_at?: string;
  updated_at?: string;
}

export interface Settings {
  company_name?: string;
  company_logo?: string;
  office_start?: string;
  office_end?: string;
  theme?: string;
  office_latitude?: string;
  office_longitude?: string;
  allowed_radius_km?: string;
  mission?: string;
  vision?: string;
}

export interface AttendanceSummary {
  total: number;
  present: number;
  absent: number;
  late: number;
  remote: number;
  office: number;
  leave?: number;
  total_hours: number;
  avg_hours: number;
  attendance_rate: number;
}

/** Review state of a leave request. */
export type LeaveStatus = 'pending' | 'approved' | 'rejected';

/** A leave request submitted by an employee or intern. */
export interface LeaveRequest {
  _id: string;
  person_type: PersonType;
  person_id: string;
  person_name?: string;
  id_label?: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  days: number;
  reason?: string;
  status: LeaveStatus;
  review_note?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AttendanceEvent {
  key: string;
  label: string;
  time: string;
  kind: 'in' | 'out';
}

export type AttendanceStateKind = 'not-checked-in' | 'working' | 'checked-out' | 'absent';

export interface PhotoLocation {
  latitude: number;
  longitude: number;
}

export interface PhotoPreview {
  uri: string;
  width?: number;
  height?: number;
}

export type TaskStatus = 'Pending' | 'In Progress' | 'Completed';

export type TaskPriority = 'High' | 'Medium' | 'Low';

export type PersonType = 'employee' | 'intern';

/**
 * A safe, professional projection of a person record. Sensitive backend
 * fields (password hashes, DOB, notes, addresses) are never included here.
 */
export interface DirectoryPerson {
  _id: string;
  idLabel?: string;
  name: string;
  department?: string;
  designation?: string;
  status?: string;
  email?: string;
  phone?: string;
  photoPath?: string;
  joiningDate?: string;
  college?: string;
  person_type: PersonType;
}

export type MoreStackParamList = {
  MoreHome: undefined;
  Directory: undefined;
  EmployeeProfile: { person: DirectoryPerson };
  MyProfile: undefined;
  EditProfile: undefined;
  Settings: undefined;
  ChangePassword: undefined;
};

export interface TaskComment {
  author: string;
  author_type: string;
  body: string;
  created_at?: string;
}

export interface Task {
  _id: string;
  title: string;
  description?: string;
  assigned_to?: string;
  assigned_to_name?: string;
  assigned_type?: 'employee' | 'intern';
  created_by?: string;
  created_by_name?: string;
  project_id?: string;
  project_name?: string;
  priority: TaskPriority;
  deadline?: string;
  status: TaskStatus;
  remarks?: string;
  comments?: TaskComment[];
  created_at?: string;
  updated_at?: string;
}

/** Company project progress state shown on the company-wide Work screen. */
export type ProjectStatus = 'Ongoing' | 'On Hold' | 'Completed';

/** A resolved member of a project (safe display fields only). */
export interface ProjectMember {
  person_id: string;
  person_type: PersonType;
  name?: string;
  code?: string;
  department?: string;
  designation?: string;
}

/** A company-wide project, as returned by GET /api/projects. */
export interface Project {
  _id: string;
  title: string;
  description?: string;
  status: ProjectStatus;
  progress: number;
  team_lead_id?: string;
  team_lead_type?: PersonType;
  team_lead_name?: string;
  members?: { person_id: string; person_type: PersonType }[];
  members_detail?: ProjectMember[];
  member_count?: number;
  is_confidential?: boolean;
  allowed_intern_ids?: string[];
  start_date?: string;
  deadline?: string;
  created_at?: string;
  updated_at?: string;
}

export type WorkStackParamList = {
  WorkHome: undefined;
  ProjectDetail: { projectId: string };
};

export interface EmployeeDocument {
  _id: string;
  file_name: string;
  category: string;
  file_type?: string;
  file_size?: number;
  linked_person?: string;
  uploaded_at?: string;
}

/** Statuses the support backend uses for employee requests. */
export type SupportStatus =
  | 'open'
  | 'in_progress'
  | 'waiting'
  | 'resolved'
  | 'rejected'
  | 'cancelled'
  | 'closed';

/** Priority a support request can carry. Chosen by the employee on creation. */
export type SupportPriority = 'low' | 'medium' | 'high';

export type SupportAuthorType = 'employee' | 'support';

export interface SupportAttachment {
  attachment_id: string;
  file_name: string;
  file_type?: string;
  mime?: string;
  file_size?: number;
}

export interface SupportComment {
  author_type: SupportAuthorType;
  author: string;
  body?: string;
  attachments?: SupportAttachment[];
  created_at?: string;
}

export interface SupportActivityEntry {
  action: string;
  author_type?: SupportAuthorType | string;
  author?: string;
  details?: string;
  timestamp?: string;
}

export interface SupportTicket {
  _id: string;
  ticket_number: string;
  person_id: string;
  person_type?: PersonType;
  person_label?: string;
  id_label?: string;
  category: string;
  subject: string;
  description: string;
  priority: SupportPriority;
  status: SupportStatus;
  attachments?: SupportAttachment[];
  comments?: SupportComment[];
  activity?: SupportActivityEntry[];
  created_at?: string;
  updated_at?: string;
}

/** Server-side counts per status for the current query. */
export type SupportStatusStats = Record<SupportStatus, number>;

export interface SupportRequestListResponse {
  requests: SupportTicket[];
  total: number;
  stats: SupportStatusStats;
}

/**
 * One entry from GET /api/employees/birthdays. The backend returns only the
 * next occurrence of each employee's birthday inside the requested window.
 */
export interface BirthdayEntry {
  name: string;
  employee_id: string;
  dob: string;
  days_until: number;
  birthday: string;
}

/** One published company announcement from the server history. */
export interface Announcement {
  _id: string;
  content: string;
  created_at: string;
  author_id?: string | null;
  author_type?: string | null;
  author_name?: string | null;
}

/** The dated information the calendar can show from existing backend data. */
export type CalendarItemKind = 'leave' | 'task' | 'birthday';

/**
 * A single dated item on the calendar. Every backend source the calendar
 * uses is date-only, so no time-of-day is ever invented here.
 */
export interface CalendarDayItem {
  id: string;
  kind: CalendarItemKind;
  /** The YYYY-MM-DD day this item is rendered on. */
  date: string;
  title: string;
  /** Short secondary line shown under the title. */
  meta: string;
  /** Longer context (task description, leave span, employee id). */
  detail?: string;
  /** Inclusive range for leave items; equals `date` for single-day items. */
  startDate?: string;
  endDate?: string;
  /** Present for task items so the existing task detail can be opened. */
  taskId?: string;
}

export type CalendarStackParamList = {
  CalendarHome: undefined;
  CalendarItem: { item: CalendarDayItem };
};

export type RootStackParamList = {
  Login: undefined;
  MainTabs: NavigatorScreenParams<TabParamList> | undefined;
  Camera: undefined;
  Attendance: undefined;
  Notifications: undefined;
  Documents: NavigatorScreenParams<DocumentsStackParamList> | undefined;
  Support: NavigatorScreenParams<SupportStackParamList> | undefined;
  Calendar: NavigatorScreenParams<CalendarStackParamList> | undefined;
  More: NavigatorScreenParams<MoreStackParamList> | undefined;
  Leave: NavigatorScreenParams<LeaveStackParamList> | undefined;
  WorkSummary: undefined;
  Search: undefined;
};

export type TasksStackParamList = {
  TasksList: undefined;
  TaskDetail: { taskId: string };
};

export type LeaveStackParamList = {
  LeaveHome: undefined;
  ApplyLeave: undefined;
};

export type DocumentsStackParamList = {
  DocumentsHome: undefined;
  DocumentDetail: { document: EmployeeDocument };
  UploadDocument: undefined;
};

export type SupportStackParamList = {
  SupportHome: undefined;
  NewRequest: undefined;
  RequestDetail: { ticketId: string };
};

export type TabParamList = {
  Attendance: undefined;
  Tasks: NavigatorScreenParams<TasksStackParamList> | undefined;
  Dashboard: undefined;
  Work: NavigatorScreenParams<WorkStackParamList> | undefined;
  Announcements: undefined;
};