export function settingsTabRedirectLocation(search, tab) {
  const params = new URLSearchParams(search);
  params.set('tab', tab);
  return { pathname: '/manager/settings', search: `?${params.toString()}` };
}