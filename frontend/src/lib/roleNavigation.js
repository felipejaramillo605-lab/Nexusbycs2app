export const getHomeForRole = (role) => {
  if (role === 'owner') return '/owner';
  if (role === 'staff') return '/staff/profile';
  return '/manager/dashboard';
};
