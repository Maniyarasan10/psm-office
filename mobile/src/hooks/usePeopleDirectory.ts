import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DirectoryPerson, PersonType } from '../types';
import { getEmployees, getInterns, RawPersonRecord } from '../services/api';
import { toDirectoryPerson, sortPeopleByName } from '../utils/people';
import { readCache, writeCache } from '../services/offlineCache';

const PEOPLE_CACHE_KEY = 'people';

export interface DirectorySection {
  title: string;
  members: DirectoryPerson[];
}

export interface PeopleDirectoryData {
  people: DirectoryPerson[];
  grouped: DirectorySection[];
  departments: string[];
  search: string;
  setSearch: (search: string) => void;
  departmentFilter: string;
  setDepartmentFilter: (department: string) => void;
  loading: boolean;
  refreshing: boolean;
  error: boolean;
  reload: () => void;
  refresh: () => void;
}

/**
 * Loads every employee and intern once (bounded by company size) and
 * projects each record into a safe DirectoryPerson, so no sensitive
 * backend fields ever reach the UI. Search and filtering are local.
 */
export function usePeopleDirectory(): PeopleDirectoryData {
  const [people, setPeople] = useState<DirectoryPerson[]>([]);
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const requestId = useRef(0);

  useEffect(() => {
    let active = true;
    void readCache<DirectoryPerson[]>(PEOPLE_CACHE_KEY).then(cached => {
      if (!active || !cached || !Array.isArray(cached.data)) return;
      setPeople(cached.data);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const run = useCallback(async (mode: 'initial' | 'refresh') => {
    const id = ++requestId.current;
    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);

    try {
      const [employeesResponse, internsResponse] = await Promise.all([
        getEmployees(),
        getInterns(),
      ]);

      const map = (rows: RawPersonRecord[], personType: PersonType): DirectoryPerson[] =>
        sortPeopleByName(
          (Array.isArray(rows) ? rows : [])
            .filter(row => row && typeof row._id === 'string' && !!row.name)
            .map(row => toDirectoryPerson(row, personType))
        );

      const employees = map(employeesResponse.data, 'employee');
      const interns = map(internsResponse.data, 'intern');

      if (id !== requestId.current) return;
      const nextPeople = [...employees, ...interns];
      setPeople(nextPeople);
      writeCache(PEOPLE_CACHE_KEY, nextPeople);
      setError(false);
    } catch {
      if (id !== requestId.current) return;
      setError(true);
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  const reload = useCallback(() => {
    void run('initial');
  }, [run]);

  const refresh = useCallback(() => {
    void run('refresh');
  }, [run]);

  useEffect(() => {
    void run('initial');
    return () => {
      requestId.current += 1;
    };
  }, [run]);

  const departments = useMemo(() => {
    const set = new Set<string>();
    people.forEach(person => {
      if (person.department && person.department.trim().length > 0) {
        set.add(person.department.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [people]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return people.filter(person => {
      if (departmentFilter && person.department !== departmentFilter) return false;
      if (!query) return true;
      const haystack = [
        person.name,
        person.idLabel,
        person.department,
        person.designation,
        person.college,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [people, search, departmentFilter]);

  const grouped = useMemo(() => {
    const groups = new Map<string, DirectoryPerson[]>();
    filtered.forEach(person => {
      const key = person.department && person.department.trim().length > 0 ? person.department.trim() : 'Unassigned';
      const list = groups.get(key) ?? [];
      list.push(person);
      groups.set(key, list);
    });
    return Array.from(groups.entries())
      .map(([title, members]) => ({
        title,
        members: sortPeopleByName(members),
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [filtered]);

  return {
    people: filtered,
    grouped,
    departments,
    search,
    setSearch,
    departmentFilter,
    setDepartmentFilter,
    loading,
    refreshing,
    error,
    reload,
    refresh,
  };
}