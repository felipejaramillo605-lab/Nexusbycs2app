import React from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { AdminShell } from './AdminShell';

export function RouteExperienceFrame({children}){
 const location=useLocation();const [sp]=useSearchParams();
 const admin=location.pathname.startsWith('/manager/')||location.pathname.startsWith('/owner/');
 const publicExperience=location.pathname.startsWith('/book/')||location.pathname.startsWith('/portal/');
 if(admin)return <AdminShell organizationName="Nexus" organizationId={sp.get('org_id')}>{children}</AdminShell>;
 if(publicExperience)return <div className="nexus-public-experience"><div className="nexus-public-orb nexus-public-orb-one"/><div className="nexus-public-orb nexus-public-orb-two"/><div className="nexus-public-content">{children}</div></div>;
 return children;
}
