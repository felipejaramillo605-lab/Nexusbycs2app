export const getHomeForRole = (role) => {
  if (role === 'owner') return '/owner/access-control';
  if (role === 'staff') return '/staff/profile';
  return '/manager/dashboard';
};
