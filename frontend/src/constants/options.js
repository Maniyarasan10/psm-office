export const DEPARTMENTS = [
  'Engineering',
  'Design',
  'Sales',
  'HR',
  'Operations',
  'Marketing',
];

export const DESIGNATIONS_BY_DEPARTMENT = {
  Engineering: [
    'Software Engineer',
    'Senior Software Engineer',
    'Lead Software Engineer',
    'Full Stack Developer',
    'Frontend Developer',
    'Backend Developer',
    'Mobile Developer',
    'QA Engineer',
    'DevOps Engineer',
    'Data Engineer',
    'Engineering Manager',
    'Intern',
  ],
  Design: [
    'UI/UX Designer',
    'Senior UI/UX Designer',
    'Product Designer',
    'Graphic Designer',
    'Motion Designer',
    'Design Lead',
    'Intern',
  ],
  Sales: [
    'Sales Executive',
    'Senior Sales Executive',
    'Business Development Executive',
    'Account Manager',
    'Sales Lead',
    'Sales Manager',
    'Intern',
  ],
  HR: [
    'HR Executive',
    'HR Generalist',
    'Recruiter',
    'Talent Acquisition Specialist',
    'People Operations',
    'HR Manager',
    'Intern',
  ],
  Operations: [
    'Operations Executive',
    'Operations Coordinator',
    'Office Administrator',
    'Facilities Manager',
    'Operations Lead',
    'Operations Manager',
    'Intern',
  ],
  Marketing: [
    'Marketing Executive',
    'Content Writer',
    'SEO Specialist',
    'Social Media Manager',
    'Digital Marketing Specialist',
    'Brand Manager',
    'Marketing Manager',
    'Intern',
  ],
};

const COMMON_DESIGNATIONS = [
  'Director',
  'General Manager',
  'Team Lead',
  'Consultant',
];

export function designationsFor(department) {
  if (!department) return [];
  return [...(DESIGNATIONS_BY_DEPARTMENT[department] ?? []), ...COMMON_DESIGNATIONS];
}

export function allDesignations() {
  const seen = new Set();
  const result = [];
  const push = (value) => {
    if (value && !seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  };
  DEPARTMENTS.forEach((dept) => designationsFor(dept).forEach(push));
  COMMON_DESIGNATIONS.forEach(push);
  return result;
}
