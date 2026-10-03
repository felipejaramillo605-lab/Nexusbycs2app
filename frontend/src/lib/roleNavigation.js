export const getHomeForRole = (role) => {
  if (role === 'owner') return '/owner';
  if (role === 'staff') return '/staff/appointments';
  return '/manager/dashboard';
};
