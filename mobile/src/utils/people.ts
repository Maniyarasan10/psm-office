import { DirectoryPerson, PersonType } from '../types';
import { RawPersonRecord } from '../services/api';
import { profilePhotoUrl } from '../services/api';

/**
 * Converts a raw API person record into a safe, professional projection.
 * All unknown/sensitive fields (password_hash, dob, notes, addresses,
 * attendance, documents, finance) are intentionally dropped here.
 */
export function toDirectoryPerson(raw: RawPersonRecord, personType: PersonType): DirectoryPerson {
  const idLabel = personType === 'intern' ? raw.intern_id : raw.employee_id;
  return {
    _id: raw._id ?? '',
    idLabel: idLabel || undefined,
    name: raw.name ?? 'Unknown',
    department: raw.department || undefined,
    designation: raw.designation || undefined,
    status: raw.status || undefined,
    email: raw.email || undefined,
    phone: raw.phone || undefined,
    photoPath: raw.photo_path || undefined,
    joiningDate: raw.joining_date || undefined,
    college: raw.college || undefined,
    person_type: personType,
  };
}

export function initialsOf(name: string | undefined): string {
  return (
    name
      ?.split(' ')
      .filter(Boolean)
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) ?? '?'
  );
}

export function avatarSource(photoPath?: string) {
  const resolved = profilePhotoUrl(photoPath);
  return resolved ? { uri: resolved } : undefined;
}

export function formatDate(value?: string): string {
  if (!value) return 'Information unavailable';
  const iso = value.slice(0, 10);
  if (!/\d{4}-\d{2}-\d{2}/.test(iso)) return value;
  const date = new Date(iso.replace(/-/g, '/') + ' 00:00:00');
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function roleLabel(person: DirectoryPerson): string {
  if (person.person_type === 'intern') {
    return person.college ? `Intern · ${person.college}` : 'Intern';
  }
  return person.designation || 'Employee';
}

export function departmentLabel(department?: string): string {
  return department || 'Unassigned';
}

export function sortPeopleByName(people: DirectoryPerson[]): DirectoryPerson[] {
  return [...people].sort((a, b) => a.name.localeCompare(b.name));
}